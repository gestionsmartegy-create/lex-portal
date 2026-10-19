import "server-only";
import { z } from "zod";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { formatZoned, zonedToUtc } from "@/lib/zoned-time";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getClioGateway } from "@/server/providers";
import { ClioError } from "@/server/providers/clio/gateway";
import type { ClioCalendarEntryState } from "@/server/providers/clio/schemas";
import { recordAudit } from "@/server/services/audit";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";
import { timezones, type Timezone } from "@/server/services/offices";

/**
 * Dates de cour (ADR 0025, lot 2). Saisies dans la plateforme (équipe du dossier ou firm_admin,
 * RLS + assertMatterAccess), puis écrites dans le calendrier Clio choisi par le cabinet.
 * La plateforme ne calcule AUCUN délai légal : chaque date est saisie et confirmée par un avocat.
 */
export const courtDateKinds = [
  "trial",
  "hearing",
  "motion",
  "case_conference",
  "appearance",
  "filing_deadline",
] as const;
export type CourtDateKind = (typeof courtDateKinds)[number];
export const courtDateModes = ["in_person", "virtual", "hybrid"] as const;
export type CourtDateStatus = "scheduled" | "confirmed" | "adjourned" | "cancelled" | "held";
export type ClioSyncStatus = "pending" | "syncing" | "synced" | "failed" | "not_applicable";

export type CourtDate = {
  id: string;
  matter_id: string;
  kind: CourtDateKind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  timezone: Timezone;
  court_id: string | null;
  room: string | null;
  judge: string | null;
  docket_number: string | null;
  mode: (typeof courtDateModes)[number];
  virtual_link: string | null;
  notes: string | null;
  client_instructions: string | null;
  visible_to_client: boolean;
  status: CourtDateStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  replaces_id: string | null;
  cancel_reason: string | null;
  clio_sync_status: ClioSyncStatus;
  clio_synced_at: string | null;
  attendeeIds: string[];
};

const COLUMNS =
  "id, matter_id, kind, starts_at, ends_at, all_day, timezone, court_id, room, judge, docket_number, mode, virtual_link, notes, client_instructions, visible_to_client, status, confirmed_by, confirmed_at, replaces_id, cancel_reason, clio_sync_status, clio_synced_at";

type Result = { ok: true; id?: string } | { ok: false; code: "NOT_FOUND" | "FAILED" | "INVALID" | "CLOSED" };
const fail = (code: "NOT_FOUND" | "FAILED" | "INVALID" | "CLOSED" = "FAILED"): Result => ({
  ok: false,
  code,
});
const uuid = z.uuid();

/** Texte d'une seule ligne (envoyé tel quel dans la description Clio) : aucun caractère de contrôle. */
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\x00-\x1F\x7F]/.test(v), "single-line")
    .default("");

/** Saisie : heures locales (« AAAA-MM-JJTHH:MM ») dans le fuseau du tribunal ou du dossier. */
export const courtDateInputSchema = z.object({
  kind: z.enum(courtDateKinds),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  end: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        .nullable(),
    ),
  allDay: z.boolean().default(false),
  timezone: z.enum(timezones),
  courtId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  room: singleLine(80),
  judge: singleLine(120),
  docketNumber: singleLine(80),
  mode: z.enum(courtDateModes).default("in_person"),
  virtualLink: z
    .string()
    .trim()
    .max(500)
    .default("")
    .refine((v) => v === "" || /^https:\/\/[^\s\x00-\x1F\x7F]+$/.test(v), "https"),
  notes: z.string().trim().max(2000).default(""),
  clientInstructions: z.string().trim().max(2000).default(""),
  visibleToClient: z.boolean().default(false),
  attendeeIds: z.array(z.uuid()).max(20).default([]),
});
export type CourtDateInput = z.infer<typeof courtDateInputSchema>;

/** Un tribunal provincial impose son fuseau (une audience à Toronto est à l'heure de l'Est). */
async function withCourtTimezone(input: CourtDateInput): Promise<CourtDateInput> {
  if (!input.courtId) return input;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("courts").select("timezone").eq("id", input.courtId).maybeSingle();
  const tz = timezones.find((z) => z === data?.timezone);
  return tz ? { ...input, timezone: tz } : input;
}

/** Colonnes à écrire ; null si les heures sont invalides (fin avant début, heure impossible). */
function toRow(input: CourtDateInput) {
  const startLocal = input.allDay ? `${input.start.slice(0, 10)}T00:00` : input.start;
  const startsAt = zonedToUtc(startLocal, input.timezone);
  const endsAt = input.allDay || !input.end ? null : zonedToUtc(input.end, input.timezone);
  if (!startsAt || (input.end && !input.allDay && !endsAt)) return null;
  if (endsAt && endsAt < startsAt) return null;
  return {
    kind: input.kind,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: input.allDay,
    timezone: input.timezone,
    court_id: input.courtId,
    room: input.room || null,
    judge: input.judge || null,
    docket_number: input.docketNumber || null,
    mode: input.mode,
    virtual_link: input.mode === "in_person" ? null : input.virtualLink || null,
    notes: input.notes || null,
    client_instructions: input.clientInstructions || null,
    visible_to_client: input.visibleToClient,
  };
}

async function setAttendees(courtDateId: string, ids: string[]): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error } = await supabase
    .from("court_date_attendees")
    .select("user_id")
    .eq("court_date_id", courtDateId);
  if (error) return false;
  const have = new Set((current ?? []).map((a) => a.user_id));
  const want = new Set(ids);
  const remove = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) {
    const r = await supabase
      .from("court_date_attendees")
      .delete()
      .eq("court_date_id", courtDateId)
      .in("user_id", remove);
    if (r.error) return false;
  }
  if (add.length) {
    const r = await supabase
      .from("court_date_attendees")
      .insert(add.map((user_id) => ({ court_date_id: courtDateId, user_id })));
    if (r.error) return false;
  }
  return true;
}

export async function listCourtDates(matterId: string): Promise<CourtDate[] | null> {
  if (!uuid.safeParse(matterId).success || !(await assertStaffMatterAccess(matterId))) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("court_dates")
    .select(`${COLUMNS}, court_date_attendees(user_id)`)
    .eq("matter_id", matterId)
    .order("starts_at");
  return (data ?? []).map((d) => {
    const { court_date_attendees, ...rest } = d as typeof d & { court_date_attendees: { user_id: string }[] };
    return {
      ...(rest as unknown as Omit<CourtDate, "attendeeIds">),
      attendeeIds: court_date_attendees.map((a) => a.user_id),
    };
  });
}

/** À venir (actives, pas encore passées depuis plus d'un jour) et historique (le plus récent d'abord). */
export function partitionCourtDates(list: CourtDate[], now: number = Date.now()) {
  const upcoming = list.filter(
    (d) =>
      (d.status === "scheduled" || d.status === "confirmed") &&
      new Date(d.ends_at ?? d.starts_at).getTime() >= now - 86_400_000,
  );
  const history = list.filter((d) => !upcoming.includes(d)).reverse();
  return { upcoming, history };
}

/** Lecture d'une date et contrôle d'accès à son dossier (même réponse pour « absent » et « refusé »). */
async function loadForWrite(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("court_dates")
    .select("id, matter_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!data || !(await assertStaffMatterAccess(data.matter_id))) return null;
  return data;
}

export async function createCourtDate(
  matterId: string,
  input: CourtDateInput,
  replacesId: string | null = null,
): Promise<Result> {
  if (!uuid.safeParse(matterId).success || !(await assertStaffMatterAccess(matterId)))
    return fail("NOT_FOUND");
  const row = toRow(await withCourtTimezone(input));
  if (!row) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_dates")
    .insert({ ...row, matter_id: matterId, replaces_id: replacesId })
    .select("id")
    .single();
  if (error || !data) return fail();
  const attendeesOk = await setAttendees(data.id, input.attendeeIds);
  await syncCourtDateToClio(data.id);
  if (!attendeesOk) return fail();
  return { ok: true, id: data.id };
}

export async function updateCourtDate(id: string, input: CourtDateInput): Promise<Result> {
  const current = await loadForWrite(id);
  if (!current) return fail("NOT_FOUND");
  if (current.status !== "scheduled" && current.status !== "confirmed") return fail("CLOSED");
  const row = toRow(await withCourtTimezone(input));
  if (!row) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("court_dates").update(row).eq("id", id);
  if (error) return fail();
  const attendeesOk = await setAttendees(id, input.attendeeIds);
  await syncCourtDateToClio(id);
  if (!attendeesOk) return fail();
  return { ok: true, id };
}

/** Changement de statut : confirmer (avocat de l'équipe), tenue, annulée (motif obligatoire). */
export async function setCourtDateStatus(
  id: string,
  status: "confirmed" | "held" | "cancelled",
  reason = "",
): Promise<Result> {
  const current = await loadForWrite(id);
  if (!current) return fail("NOT_FOUND");
  if (current.status !== "scheduled" && current.status !== "confirmed") return fail("CLOSED");
  if (status === "cancelled" && !reason.trim()) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("court_dates")
    .update({ status, cancel_reason: status === "cancelled" ? reason.trim() : null })
    .eq("id", id);
  if (error) return fail();
  await syncCourtDateToClio(id);
  return { ok: true, id };
}

/** Remise : la nouvelle date est créée (à confirmer), liée à l'ancienne, qui passe « remise ». */
export async function adjournCourtDate(id: string, input: CourtDateInput): Promise<Result> {
  const current = await loadForWrite(id);
  if (!current) return fail("NOT_FOUND");
  if (current.status !== "scheduled" && current.status !== "confirmed") return fail("CLOSED");
  const created = await createCourtDate(current.matter_id, input, id);
  if (!created.ok) return created;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("court_dates").update({ status: "adjourned" }).eq("id", id);
  if (error) return fail();
  await syncCourtDateToClio(id);
  return created;
}

// ---------------------------------------------------------------------------------------------
// Écriture dans Clio
// ---------------------------------------------------------------------------------------------
export const KIND_LABEL: Record<CourtDateKind, string> = {
  trial: "Procès / Trial",
  hearing: "Audience / Hearing",
  motion: "Requête / Motion",
  case_conference: "Conférence de gestion / Case conference",
  appearance: "Comparution / Appearance",
  filing_deadline: "Date limite de dépôt / Filing deadline",
};

/**
 * Écrit (ou met à jour, ou retire) l'entrée Clio d'une date de cour.
 * service_role : synchronisation vers Clio (usage permis, AGENTS.md §6) ; appelé seulement après
 * un contrôle d'accès réussi, ou par le planificateur. Jamais de note interne envoyée.
 * Réservation (« syncing ») : une seule écriture à la fois par date, pour éviter les doublons dans Clio.
 * Les colonnes de synchronisation ne sont pas modifiables par les utilisateurs (droits par colonne).
 */
export async function syncCourtDateToClio(id: string): Promise<ClioSyncStatus | "busy"> {
  const admin = createSupabaseServiceClient();
  // Une réservation de plus de 10 minutes est considérée comme abandonnée (processus interrompu).
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: cd } = await admin
    .from("court_dates")
    .update({ clio_sync_status: "syncing" })
    .eq("id", id)
    .or(`clio_sync_status.neq.syncing,updated_at.lt.${stale}`)
    .select(
      "id, matter_id, kind, starts_at, ends_at, all_day, timezone, room, judge, docket_number, mode, virtual_link, status, clio_calendar_entry_id, matters(clio_matter_id, display_number), courts(name_fr, name_en, address)",
    )
    .maybeSingle();
  if (!cd) return "busy";
  const matter = cd.matters as unknown as {
    clio_matter_id: string | null;
    display_number: string | null;
  } | null;
  const court = cd.courts as unknown as { name_fr: string; name_en: string; address: string | null } | null;
  /** L'identifiant Clio est toujours enregistré ; l'état ne l'est que si personne n'a modifié la date entre-temps. */
  const finish = async (status: ClioSyncStatus, entryId: string | null = cd.clio_calendar_entry_id) => {
    if (entryId !== cd.clio_calendar_entry_id)
      await admin.from("court_dates").update({ clio_calendar_entry_id: entryId }).eq("id", id);
    await admin
      .from("court_dates")
      .update({
        clio_sync_status: status,
        clio_synced_at: status === "synced" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .eq("clio_sync_status", "syncing");
    return status;
  };
  const journal = (action: "court_date.clio_written" | "court_date.clio_deleted", created = false) =>
    recordAudit({
      action,
      resourceType: "court_date",
      resourceId: cd.id,
      matterId: cd.matter_id,
      actorId: null,
      metadata: { created },
    });
  // Dossier sans équivalent Clio (démonstration ou saisi à la main) : rien à écrire.
  if (!matter?.clio_matter_id) return finish("not_applicable", null);
  const gateway = getClioGateway();
  try {
    if (cd.status === "cancelled" || cd.status === "adjourned") {
      if (cd.clio_calendar_entry_id) {
        await gateway.deleteCalendarEntry(cd.clio_calendar_entry_id);
        await journal("court_date.clio_deleted");
      }
      return finish("synced", null);
    }
    const { data: calendarId } = await admin.rpc("clio_court_calendar_internal");
    if (!calendarId) return finish("pending");
    const start = cd.starts_at;
    const end = cd.ends_at ?? new Date(new Date(start).getTime() + 3_600_000).toISOString();
    const input = {
      calendarId: Number(calendarId),
      matterId: Number(matter.clio_matter_id),
      summary: `[Cour] ${KIND_LABEL[cd.kind as CourtDateKind]} — ${matter.display_number ?? ""}`.trim(),
      description: [
        court ? `Tribunal / Court: ${court.name_fr} / ${court.name_en}` : null,
        cd.room ? `Salle / Room: ${cd.room}` : null,
        cd.judge ? `Juge / Judge: ${cd.judge}` : null,
        cd.docket_number ? `N° de greffe / Court file no.: ${cd.docket_number}` : null,
        cd.mode !== "in_person" && cd.virtual_link ? `Lien / Link: ${cd.virtual_link}` : null,
        `Heure du tribunal / Court time: ${formatZoned(start, cd.timezone, "fr", cd.all_day)}`,
        `Statut / Status: ${
          cd.status === "confirmed"
            ? "confirmée / confirmed"
            : cd.status === "held"
              ? "tenue / held"
              : "à confirmer / to be confirmed"
        }`,
        "Saisi dans le portail Lex : modifier la date dans le portail. / Entered in the Lex portal: edit it there.",
      ]
        .filter(Boolean)
        .join("\n"),
      location: [court?.name_fr, cd.room ? `salle ${cd.room}` : null, court?.address]
        .filter(Boolean)
        .join(", "),
      startAt: start,
      endAt: end,
      allDay: cd.all_day,
    };
    if (cd.clio_calendar_entry_id && (await gateway.updateCalendarEntry(cd.clio_calendar_entry_id, input))) {
      await journal("court_date.clio_written");
      return finish("synced");
    }
    const entryId = await gateway.createCalendarEntry(input);
    await journal("court_date.clio_written", true);
    return finish("synced", entryId);
  } catch (error) {
    const code = error instanceof ClioError ? error.code : "UPSTREAM";
    console.error(JSON.stringify({ event: "court_date_clio_sync_failed", code }));
    return finish("failed");
  }
}

/** Planificateur : nouvelle tentative pour les dates en attente, en échec ou à la réservation abandonnée. */
export async function pushPendingCourtDates(limit = 50) {
  const admin = createSupabaseServiceClient();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin
    .from("court_dates")
    .select("id")
    .or(`clio_sync_status.in.(pending,failed),and(clio_sync_status.eq.syncing,updated_at.lt.${stale})`)
    .order("updated_at")
    .limit(limit);
  let synced = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const status = await syncCourtDateToClio(row.id);
    if (status === "synced" || status === "not_applicable") synced += 1;
    else if (status === "failed") failed += 1;
  }
  return { synced, failed };
}

/**
 * Retour depuis Clio (E16, ADR 0031) : une date écrite par la plateforme, puis modifiée ou supprimée
 * directement dans Clio, est signalée. Déplacée : nouvelle heure, et une date confirmée redevient
 * « à confirmer ». Introuvable : « à confirmer » et signalée, JAMAIS annulée automatiquement (un 404 peut
 * venir d'un droit retiré ou d'un calendrier changé). Garde-fou : plus de MAX_MISSING entrées introuvables
 * dans un même passage, rien n'est appliqué (panne probable côté Clio). Seules les dates déjà synchronisées
 * sont comparées (une modification locale en attente n'est pas un changement venu de Clio).
 * Une journée entière n'est pas comparée à l'heure près (format des dates sans heure à confirmer).
 * service_role : synchronisation (usage permis), depuis le planificateur seulement.
 */
export async function pullClioCourtDateChanges(limit = 60) {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("court_dates")
    .select("id, starts_at, ends_at, all_day, clio_calendar_entry_id")
    .eq("clio_sync_status", "synced")
    .in("status", ["scheduled", "confirmed"])
    .not("clio_calendar_entry_id", "is", null)
    .is("clio_change", null)
    .gt("starts_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("starts_at")
    .limit(limit);
  const gateway = getClioGateway();
  const changes: { id: string; change: NonNullable<ReturnType<typeof clioChangeOf>> }[] = [];
  for (const cd of data ?? []) {
    let entry: ClioCalendarEntryState;
    try {
      entry = await gateway.getCalendarEntry(cd.clio_calendar_entry_id as string);
    } catch (error) {
      const code = error instanceof ClioError ? error.code : "UPSTREAM";
      console.error(JSON.stringify({ event: "court_date_clio_pull_failed", code }));
      if (code === "TOKEN_REVOKED" || code === "NOT_CONNECTED" || code === "RATE_LIMITED") break;
      continue;
    }
    const change = clioChangeOf(cd, entry);
    if (change) changes.push({ id: cd.id, change });
  }
  const missing = changes.filter((c) => c.change.kind === "deleted").length;
  if (missing > MAX_MISSING) {
    console.error(JSON.stringify({ event: "court_date_clio_pull_suspicious", missing }));
    return { moved: 0, missing: 0, skipped: true };
  }
  let moved = 0;
  let missingApplied = 0;
  for (const { id, change } of changes) {
    const { data: applied } = await admin.rpc("court_date_apply_clio_change", {
      p_id: id,
      p_change: change.kind,
      p_starts: change.kind === "moved" ? change.startAt : NULL_ARG,
      p_ends: change.kind === "moved" && change.endAt ? change.endAt : NULL_ARG,
    });
    if (applied && change.kind === "moved") moved += 1;
    if (applied && change.kind === "deleted") missingApplied += 1;
  }
  return { moved, missing: missingApplied, skipped: false };
}

/** Au-delà, un passage qui trouve autant d'entrées introuvables n'applique rien. */
const MAX_MISSING = 5;

/** null explicite pour une RPC (les types générés ne marquent pas les paramètres nullables). */
const NULL_ARG = null as unknown as string;

/** Écart d'au moins une minute entre l'heure de la plateforme et celle de Clio. */
export function clioChangeOf(
  cd: { starts_at: string; ends_at: string | null; all_day: boolean },
  entry: ClioCalendarEntryState,
): { kind: "deleted" } | { kind: "moved"; startAt: string; endAt: string | null } | null {
  if (entry.state === "gone") return { kind: "deleted" };
  if (entry.state !== "found" || entry.allDay || cd.all_day || !entry.startAt) return null;
  const start = Date.parse(entry.startAt);
  const end = entry.endAt ? Date.parse(entry.endAt) : NaN;
  if (!Number.isFinite(start)) return null;
  const ourStart = Date.parse(cd.starts_at);
  const ourEnd = cd.ends_at ? Date.parse(cd.ends_at) : ourStart + 3_600_000;
  const validEnd = Number.isFinite(end) && end > start;
  if (Math.abs(start - ourStart) < 60_000 && (!validEnd || Math.abs(end - ourEnd) < 60_000)) return null;
  return {
    kind: "moved",
    startAt: new Date(start).toISOString(),
    endAt: validEnd ? new Date(end).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Calendrier Clio des dates de cour (firm_admin)
// ---------------------------------------------------------------------------------------------
export async function getCourtCalendarSetting() {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("clio_court_calendar");
  return data ? Number(data) : null;
}

export async function listClioCalendars() {
  if ((await getSessionRole()) !== "firm_admin") return { ok: false as const, calendars: [] };
  try {
    const calendars = await getClioGateway().listWritableCalendars();
    return { ok: true as const, calendars };
  } catch (error) {
    const code = error instanceof ClioError ? error.code : "UPSTREAM";
    console.error(JSON.stringify({ event: "clio_calendars_failed", code }));
    return { ok: false as const, calendars: [] };
  }
}

export async function setCourtCalendar(calendarId: number | null): Promise<boolean> {
  if ((await getSessionRole()) !== "firm_admin") return false;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_clio_court_calendar", { p_calendar_id: calendarId as number });
  return !error;
}

/** Fuseau par défaut d'une nouvelle date : celui du bureau du dossier, sinon Halifax. */
export async function defaultTimezoneFor(matterId: string): Promise<Timezone> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("matters")
    .select("offices(timezone)")
    .eq("id", matterId)
    .maybeSingle();
  const tz = (data?.offices as unknown as { timezone: Timezone } | null)?.timezone;
  return tz ?? (DEFAULT_TIMEZONE as Timezone);
}
