import "server-only";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getOutlookGateway } from "@/server/providers";
import { VaultOutlookTokenStore } from "@/server/providers/outlook/client";
import { OutlookError } from "@/server/providers/outlook/gateway";
import { canWriteReminders, fetchOutlookAccount } from "@/server/providers/outlook/oauth";
import { busyBlockSchema, type OutlookTokens } from "@/server/providers/outlook/schemas";
import { KIND_LABEL, type CourtDateKind } from "@/server/services/court-dates";

/**
 * Agendas Outlook du personnel (lot 4, ADR 0031, stories E14 et E15).
 * - Lecture des plages OCCUPÉES seulement (début, fin) sur 60 jours, pour les conflits d'horaire.
 * - Rappels de préparation (J-7, J-1) dans un agenda séparé « Lex Portail », si la personne le veut.
 * - Déconnexion par la personne, coupure par le firm_admin ; jetons dans Supabase Vault.
 * service_role : connexions d'intégration et synchronisation (usages permis, AGENTS.md §6), toujours
 * après un contrôle du rôle sur la session, ou depuis le planificateur.
 */
/** Permissions déléguées (docs/outlook-integration.md) ; Calendars.ReadWrite seulement pour les rappels. */
export const OUTLOOK_SCOPES = ["User.Read", "offline_access", "Calendars.ReadBasic"];
const BUSY_PAST_DAYS = 1;
const BUSY_FUTURE_DAYS = 60;
const REMINDER_MINUTES = 30;
/** null explicite pour une RPC (les types générés ne marquent pas les paramètres nullables). */
const NULL_ARG = null as unknown as string;

export type CalendarConnection = {
  status: "connected" | "needs_reconnect";
  isMock: boolean;
  remindersEnabled: boolean;
  connectedAt: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

/** Mode du cabinet : simulateur (mock) ou vrai Microsoft 365 (live, ADR 0043). */
export function outlookMode() {
  return serverEnv().INTEGRATION_MODE_OUTLOOK;
}

async function staffSession() {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return null;
  const user = await getUser();
  return user ? { userId: user.id, role } : null;
}

/** Ma connexion (personnel). */
export async function getMyCalendarConnection(): Promise<CalendarConnection | null> {
  if (!(await staffSession())) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_calendar_connection");
  const row = data?.[0];
  if (!row) return null;
  return {
    status: row.status === "needs_reconnect" ? "needs_reconnect" : "connected",
    isMock: row.is_mock,
    remindersEnabled: row.reminders_enabled,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

/** Connexions de tout le cabinet (firm_admin ; revérifié par la base). */
export async function listCalendarConnections() {
  const session = await staffSession();
  if (session?.role !== "firm_admin") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calendar_connection_list");
  if (error) return null;
  return data ?? [];
}

type Result =
  { ok: true } | { ok: false; code: "ACCESS_DENIED" | "NOT_AVAILABLE" | "SYNC_FAILED" | "NEEDS_CONSENT" };

/**
 * Connecter mon agenda, SIMULATEUR seulement : connexion immédiate, sans jeton. En mode réel, la
 * connexion passe par Microsoft (/api/integrations/outlook/connect), puis saveLiveCalendarConnection().
 */
export async function connectMyCalendar(): Promise<Result> {
  const session = await staffSession();
  if (!session) return { ok: false, code: "ACCESS_DENIED" };
  if (outlookMode() !== "mock") return { ok: false, code: "NOT_AVAILABLE" };
  const { error } = await createSupabaseServiceClient().rpc("calendar_save_connection", {
    p_user: session.userId,
    p_is_mock: true,
    p_payload: NULL_ARG,
    p_scopes: OUTLOOK_SCOPES,
  });
  if (error) return { ok: false, code: "ACCESS_DENIED" };
  const synced = await syncCalendarOf(session.userId);
  return synced ? { ok: true } : { ok: false, code: "SYNC_FAILED" };
}

/**
 * Mode réel : enregistre MA connexion au retour de Microsoft. La personne vient de la session,
 * jamais de la requête. Jetons dans Supabase Vault (service_role : connexion d'intégration, usage
 * permis par AGENTS.md §6) ; la base journalise « calendar.connected ».
 */
export async function saveLiveCalendarConnection(
  tokens: OutlookTokens,
  wantsReminders: boolean,
): Promise<
  | { ok: true; remindersOn: boolean }
  | { ok: false; code: "ACCESS_DENIED" | "NOT_AVAILABLE" | "SYNC_FAILED" | "ACCOUNT_MISMATCH" }
> {
  const session = await staffSession();
  if (!session) return { ok: false, code: "ACCESS_DENIED" };
  if (outlookMode() !== "live") return { ok: false, code: "NOT_AVAILABLE" };
  // L'agenda connecté doit être celui de la personne : le compte Microsoft choisi est comparé à
  // l'adresse de la session (une boîte partagée ou le compte d'un collègue est refusé).
  const email = (await getUser())?.email?.toLowerCase();
  const accounts = await fetchOutlookAccount(tokens.access_token);
  if (!email || !accounts.includes(email)) return { ok: false, code: "ACCOUNT_MISMATCH" };
  const { error } = await createSupabaseServiceClient().rpc("calendar_save_connection", {
    p_user: session.userId,
    p_is_mock: false,
    p_payload: JSON.stringify(tokens),
    p_scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean).slice(0, 20),
  });
  if (error) return { ok: false, code: "ACCESS_DENIED" };
  let remindersOn = false;
  if (wantsReminders && canWriteReminders(tokens.scope)) {
    const supabase = await createSupabaseServerClient();
    const { data, error: remindersError } = await supabase.rpc("calendar_set_reminders", {
      p_enabled: true,
    });
    remindersOn = !remindersError && Boolean(data);
  }
  return (await syncCalendarOf(session.userId))
    ? { ok: true, remindersOn }
    : { ok: false, code: "SYNC_FAILED" };
}

/** Synchroniser maintenant (ma connexion). */
export async function syncMyCalendar(): Promise<Result> {
  const session = await staffSession();
  if (!session) return { ok: false, code: "ACCESS_DENIED" };
  return (await syncCalendarOf(session.userId)) ? { ok: true } : { ok: false, code: "SYNC_FAILED" };
}

/** Rappels de préparation dans l'agenda « Lex Portail » : activer ou retirer. */
export async function setMyReminders(enabled: boolean): Promise<Result> {
  const session = await staffSession();
  if (!session) return { ok: false, code: "ACCESS_DENIED" };
  // Mode réel : écrire les rappels demande une permission de plus, accordée par la personne chez Microsoft.
  if (enabled && outlookMode() === "live") {
    const tokens = await new VaultOutlookTokenStore().get(session.userId);
    if (!canWriteReminders(tokens?.scope)) return { ok: false, code: "NEEDS_CONSENT" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calendar_set_reminders", { p_enabled: enabled });
  if (error || !data) return { ok: false, code: "ACCESS_DENIED" };
  return (await syncCalendarOf(session.userId)) ? { ok: true } : { ok: false, code: "SYNC_FAILED" };
}

/**
 * Déconnecter mon agenda, ou couper celui d'une personne (firm_admin). Les rappels écrits dans
 * l'agenda sont retirés d'abord (au mieux), puis la base supprime le jeton et journalise.
 */
export async function disconnectCalendar(userId: string): Promise<Result> {
  const session = await staffSession();
  if (!session || (session.userId !== userId && session.role !== "firm_admin"))
    return { ok: false, code: "ACCESS_DENIED" };
  await removeReminders(userId).catch(() => undefined);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("calendar_disconnect", { p_user: userId });
  return error ? { ok: false, code: "ACCESS_DENIED" } : { ok: true };
}

async function removeReminders(userId: string) {
  const admin = createSupabaseServiceClient();
  const { data } = await admin.rpc("calendar_reminder_events_of", { p_user: userId });
  const gateway = getOutlookGateway();
  for (const r of data ?? []) {
    await gateway.deleteReminder(userId, r.external_event_id);
    await admin.rpc("calendar_reminder_record", {
      p_user: userId,
      p_court_date: r.court_date_id,
      p_offset: r.offset_days,
      p_event_id: NULL_ARG,
      p_starts: NULL_ARG,
    });
  }
}

type SyncConnection = {
  user_id: string;
  is_mock: boolean;
  reminders_enabled: boolean;
  reminders_calendar_id: string | null;
};

/** Synchronise une personne : plages occupées, puis rappels. false en cas d'échec (code journalisé). */
async function syncCalendarOf(userId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin.rpc("calendar_connections_for_sync");
  const conn = (data ?? []).find((c) => c.user_id === userId);
  if (!conn) return false;
  return syncConnection(conn);
}

async function syncConnection(conn: SyncConnection): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const report = async (code: string) => {
    console.error(JSON.stringify({ event: "calendar_sync_failed", code }));
    await admin.rpc("calendar_report_error", { p_user: conn.user_id, p_error: code });
    return false;
  };
  // Une connexion du simulateur ne vaut rien face au vrai Microsoft 365 (et inversement) : à reconnecter.
  if (conn.is_mock !== (outlookMode() === "mock")) return report("MODE_CHANGED");
  try {
    const gateway = getOutlookGateway();
    const now = Date.now();
    const from = new Date(now - BUSY_PAST_DAYS * 86_400_000);
    const to = new Date(now + BUSY_FUTURE_DAYS * 86_400_000);
    const blocks = (await gateway.getBusyBlocks(conn.user_id, from, to)).filter(
      (b) => busyBlockSchema.safeParse(b).success,
    );
    const { error } = await admin.rpc("calendar_store_busy", {
      p_user: conn.user_id,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_blocks: blocks.slice(0, 1000),
    });
    if (error) return report("STORE_FAILED");
    await syncReminders(conn);
    return true;
  } catch (error) {
    return report(error instanceof OutlookError ? error.code : "UPSTREAM");
  }
}

/** Rappels J-7 et J-1 : création, déplacement ou retrait selon le plan calculé par la base. */
async function syncReminders(conn: SyncConnection) {
  const admin = createSupabaseServiceClient();
  const gateway = getOutlookGateway();
  const { data: plan } = await admin.rpc("calendar_reminder_plan", { p_user: conn.user_id });
  let calendarId = conn.reminders_calendar_id;
  for (const r of plan ?? []) {
    if (!r.desired_start) {
      if (r.external_event_id) await gateway.deleteReminder(conn.user_id, r.external_event_id);
      await admin.rpc("calendar_reminder_record", {
        p_user: conn.user_id,
        p_court_date: r.court_date_id,
        p_offset: r.offset_days,
        p_event_id: NULL_ARG,
        p_starts: NULL_ARG,
      });
      continue;
    }
    if (r.external_event_id && r.current_start && Date.parse(r.current_start) === Date.parse(r.desired_start))
      continue;
    if (!calendarId) {
      calendarId = await gateway.ensureReminderCalendar(conn.user_id, null);
      await admin.rpc("calendar_set_reminder_calendar", { p_user: conn.user_id, p_calendar_id: calendarId });
    }
    const start = new Date(r.desired_start);
    // Titre sans nom de client : sorte de date et numéro de dossier seulement.
    const kind = KIND_LABEL[r.kind as CourtDateKind] ?? "";
    const eventId = await gateway.upsertReminder(conn.user_id, calendarId, r.external_event_id, {
      subject:
        `Préparation J-${String(r.offset_days)} / Prep D-${String(r.offset_days)} — ${kind} — ${r.display_number ?? ""}`.trim(),
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + REMINDER_MINUTES * 60_000).toISOString(),
      timeZone: r.timezone ?? "America/Halifax",
    });
    await admin.rpc("calendar_reminder_record", {
      p_user: conn.user_id,
      p_court_date: r.court_date_id,
      p_offset: r.offset_days,
      p_event_id: eventId,
      p_starts: start.toISOString(),
    });
  }
}

/** Planificateur : toutes les connexions actives (les plus anciennes d'abord). */
export async function syncOutlookCalendars() {
  const { data } = await createSupabaseServiceClient().rpc("calendar_connections_for_sync");
  let synced = 0;
  let failed = 0;
  for (const conn of data ?? []) {
    if (await syncConnection(conn)) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
