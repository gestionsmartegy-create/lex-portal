import "server-only";
import { z } from "zod";
import type { AccessLevel } from "@/types/domain";
import type { AuditEventRow } from "@/types/portal";
import { getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { invitationEmail } from "@/server/providers/notifications/templates";
import { generateInvitationToken, hashToken } from "@/server/security/tokens";
import { recordAudit } from "@/server/services/audit";

/**
 * Espace cabinet (J5, ADR 0013). Toutes les lectures et écritures passent par la
 * SESSION du firm_admin (RLS : is_firm_admin) ; service_role seulement là où la base
 * le réserve au serveur (statut d'un compte, révocation des sessions), chaque usage commenté.
 * Les pages et Server Actions revérifient le rôle (requireStaff).
 */
const uuid = z.uuid();

export async function getAdminOverview() {
  const supabase = await createSupabaseServerClient();
  const [{ count: pendingInvitations }, { count: activeClients }, { count: openMatters }] = await Promise.all(
    [
      supabase
        .from("client_invitations")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "client")
        .eq("status", "active"),
      supabase.from("matters").select("id", { count: "exact", head: true }).neq("status", "closed"),
    ],
  );
  return {
    pendingInvitations: pendingInvitations ?? 0,
    activeClients: activeClients ?? 0,
    openMatters: openMatters ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export async function listClients() {
  const supabase = await createSupabaseServerClient();
  const { data: clients } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, status, client_number, last_seen_at, created_at")
    .eq("role", "client")
    .order("created_at", { ascending: false });
  const ids = (clients ?? []).map((c) => c.id);
  const { data: access } = ids.length
    ? await supabase.from("matter_access").select("user_id").in("user_id", ids).is("revoked_at", null)
    : { data: [] };
  const counts = new Map<string, number>();
  for (const a of access ?? []) counts.set(a.user_id, (counts.get(a.user_id) ?? 0) + 1);
  return (clients ?? []).map((c) => ({ ...c, matterCount: counts.get(c.id) ?? 0 }));
}

/**
 * Suspension / réactivation d'un compte client. Le statut est réservé au serveur
 * (trigger guard_profile) : service_role, usage permis (gestion des accès, AGENTS.md §6).
 * La suspension coupe aussi toutes les sessions ; la RLS refuse déjà tout compte non actif.
 */
export async function setClientStatus(clientId: string, status: "active" | "suspended", actorId: string) {
  if (!uuid.safeParse(clientId).success) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  // Lecture AVEC la session : le firm_admin voit le compte, et c'est bien un client.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", clientId)
    .maybeSingle();
  if (!target || target.role !== "client" || target.status === "invited") return { ok: false as const };
  const admin = createSupabaseServiceClient();
  const { error } = await admin.from("profiles").update({ status }).eq("id", clientId);
  if (error) return { ok: false as const };
  if (status === "suspended") await admin.rpc("revoke_user_sessions", { p_user: clientId });
  await recordAudit({
    action: status === "suspended" ? "profile.suspended" : "profile.reactivated",
    resourceType: "profile",
    resourceId: clientId,
    actorId,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
export async function listInvitations() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("client_invitations")
    .select(
      "id, email, first_name, last_name, preferred_language, status, expires_at, created_at, accepted_at, client_invitation_matters(matter_id, access_level, matters(display_number))",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const now = Date.now();
  // Statut affiché : une invitation « pending » dont l'échéance est passée est « expired ».
  return (data ?? []).map((inv) => ({
    ...inv,
    displayStatus:
      inv.status === "pending" && new Date(inv.expires_at).getTime() < now ? "expired" : inv.status,
  }));
}

export async function revokeInvitation(invitationId: string, actorId: string) {
  if (!uuid.safeParse(invitationId).success) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false as const };
  await recordAudit({
    action: "invitation.revoked",
    resourceType: "client_invitation",
    resourceId: invitationId,
    actorId,
  });
  return { ok: true as const };
}

/** Renvoi : NOUVEAU jeton (l'ancien lien cesse de fonctionner) et nouvelle échéance de 72 h. */
export async function resendInvitation(invitationId: string, actorId: string) {
  if (!uuid.safeParse(invitationId).success) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const token = generateInvitationToken();
  const { data: invitation, error } = await supabase
    .from("client_invitations")
    .update({ token_hash: hashToken(token), expires_at: new Date(Date.now() + 72 * 3600_000).toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id, email, first_name, preferred_language")
    .maybeSingle();
  if (error || !invitation) return { ok: false as const };
  const locale = invitation.preferred_language === "fr" ? "fr" : "en";
  await getEmailSender().send(
    await invitationEmail({
      to: invitation.email,
      locale,
      firstName: invitation.first_name,
      link: `${serverEnv().APP_BASE_URL}/${locale}/invite/${token}`,
    }),
  );
  await recordAudit({
    action: "invitation.resent",
    resourceType: "client_invitation",
    resourceId: invitationId,
    actorId,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Dossiers et accès
// ---------------------------------------------------------------------------
export async function listAdminMatters() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("matters")
    .select(
      "id, display_number, title, practice_area, status, responsible_name, is_mock, last_synced_at, updated_at",
    )
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getMatterAccessDetail(matterId: string) {
  if (!uuid.safeParse(matterId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: matter } = await supabase
    .from("matters")
    .select("id, display_number, title, practice_area, status, responsible_name, is_mock")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter) return null;
  const [{ data: team }, { data: access }] = await Promise.all([
    supabase
      .from("matter_team")
      .select("user_id, role, profiles(first_name, last_name, email)")
      .eq("matter_id", matterId),
    supabase
      .from("matter_access")
      .select(
        "id, user_id, access_level, granted_at, revoked_at, profiles!matter_access_user_id_fkey(first_name, last_name, email)",
      )
      .eq("matter_id", matterId)
      .order("granted_at", { ascending: false }),
  ]);
  // Le motif de révocation n'est pas lisible par l'API (colonne interne, ADR 0009) : il reste dans l'audit.
  return { matter, team: team ?? [], access: access ?? [] };
}

/** Octroi d'accès à un client existant (RLS : firm_admin ; trigger : auteur = session, audit automatique). */
export async function grantMatterAccess(matterId: string, email: string, level: AccessLevel) {
  const user = await getUser();
  if (!user || !uuid.safeParse(matterId).success) return { ok: false as const, code: "FAILED" as const };
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (!client || client.role !== "client") return { ok: false as const, code: "NOT_ELIGIBLE" as const };
  const { error } = await supabase
    .from("matter_access")
    .insert({ matter_id: matterId, user_id: client.id, access_level: level, granted_by: user.id });
  if (error)
    return {
      ok: false as const,
      code: error.code === "23505" ? ("DUPLICATE" as const) : ("FAILED" as const),
    };
  return { ok: true as const };
}

/** Révocation IMMÉDIATE : la RLS coupe l'accès dès la requête suivante (audit par trigger). */
export async function revokeMatterAccess(accessId: string, reason: string) {
  const user = await getUser();
  if (!user || !uuid.safeParse(accessId).success) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matter_access")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: reason })
    .eq("id", accessId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  return { ok: !error && Boolean(data) };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export async function listAuditEvents(
  opts: { before?: string; matterId?: string; limit?: number } = {},
): Promise<AuditEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_audit_events", {
    p_limit: opts.limit ?? 50,
    p_before: opts.before,
    p_matter_id: opts.matterId,
  });
  if (error) return [];
  return (data ?? []) as unknown as AuditEventRow[];
}
