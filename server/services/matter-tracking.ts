import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { MatterStatus } from "@/types/domain";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { hitRateLimit } from "@/server/security/rate-limit";
import { assertMatterAccess } from "@/server/services/access-control";
import { recordAudit } from "@/server/services/audit";
import { getMatterTypeTemplate, listMatterTypes } from "@/server/services/matter-templates";

/**
 * Suivi du dossier par le cabinet (ADR 0018).
 * - Étapes : équipe du dossier ou firm_admin. `assertMatterAccess(…, "read_write")` AVANT toute
 *   lecture ou écriture (AGENTS.md §2.4) ; la RLS revérifie (timeline_staff_*). L'avancement et
 *   l'audit sont tenus par la base (triggers de la migration 20261007120000).
 * - Équipe : firm_admin seulement (RLS matter_team_admin_*) ; l'audit est tenu par la base.
 * - Une étape terminée avertit les clients ayant un accès actif (notification dans le portail).
 * - Modèles (ADR 0019) : type du dossier, étapes et documents types, champs personnalisés,
 *   demandes de documents au client (avis dans le portail).
 */
const uuid = z.uuid();
export const stepTitleSchema = z.string().trim().min(1).max(200);
export const stepDescriptionSchema = z.string().trim().max(1000);
export const teamRoleSchema = z.enum(["responsible", "originating", "collaborator", "assistant"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

type Result = { ok: true } | { ok: false; code: "NOT_FOUND" | "FAILED" | "DUPLICATE" };
const fail = (code: "NOT_FOUND" | "FAILED" | "DUPLICATE" = "FAILED"): Result => ({ ok: false, code });

/**
 * Accès en écriture au dossier ET rôle du personnel. assertMatterAccess(…, "read_write") accepte
 * aussi un client en lecture et réponse : ce service est réservé au cabinet (revue J7-bis).
 */
export async function assertStaffMatterAccess(matterId: string) {
  await assertMatterAccess(matterId, "read_write");
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}

export type TrackingStep = {
  id: string;
  position: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  is_completed: boolean;
  completed_at: string | null;
};
type Person = { first_name: string | null; last_name: string | null; email: string };

export async function getMatterTracking(matterId: string) {
  if (!uuid.safeParse(matterId).success) return null;
  if (!(await assertStaffMatterAccess(matterId))) return null;
  const supabase = await createSupabaseServerClient();
  const isAdmin = (await getSessionRole()) === "firm_admin";
  const [
    { data: matter },
    { data: steps },
    { data: team },
    { data: staff },
    { data: values },
    { data: requests },
    { data: access },
    types,
  ] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "id, display_number, title, practice_area, status, progress_percent, is_mock, matter_type_id, office_id",
      )
      .eq("id", matterId)
      .maybeSingle(),
    supabase
      .from("matter_timeline_steps")
      .select("id, position, title, title_en, description, description_en, is_completed, completed_at")
      .eq("matter_id", matterId)
      .order("position"),
    supabase
      .from("matter_team")
      .select("user_id, role, profiles(first_name, last_name, email)")
      .eq("matter_id", matterId),
    // Liste du personnel pour l'ajout à l'équipe (firm_admin seulement).
    isAdmin
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("role", ["staff", "firm_admin"])
          .eq("status", "active")
          .order("last_name")
      : Promise.resolve({ data: [] as ({ id: string } & Person)[] }),
    supabase.from("matter_field_values").select("field_id, value").eq("matter_id", matterId),
    supabase
      .from("document_requests")
      .select(
        "id, title, title_en, description, description_en, due_date, status, created_at, requested_from, fulfilled_document_id",
      )
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false }),
    // Destinataires possibles d'une demande : clients ayant un accès actif (RLS : équipe, firm_admin).
    supabase
      .from("matter_access")
      .select("user_id, profiles!matter_access_user_id_fkey(first_name, last_name, email)")
      .eq("matter_id", matterId)
      .is("revoked_at", null),
    listMatterTypes({ activeOnly: true }),
  ]);
  if (!matter) return null;
  const template = matter.matter_type_id ? await getMatterTypeTemplate(matter.matter_type_id) : null;
  const clients = (access ?? []).map((a) => ({
    id: a.user_id,
    person: a.profiles as unknown as Person | null,
  }));
  const teamIds = new Set((team ?? []).map((m) => m.user_id));
  return {
    matter: matter as {
      id: string;
      display_number: string | null;
      title: string;
      practice_area: string | null;
      status: MatterStatus;
      progress_percent: number | null;
      is_mock: boolean;
      matter_type_id: string | null;
      office_id: string | null;
    },
    types,
    template,
    fieldValues: Object.fromEntries((values ?? []).map((v) => [v.field_id, v.value])) as Record<
      string,
      string
    >,
    requests: (requests ?? []).map((r) => ({
      ...r,
      person: clients.find((c) => c.id === r.requested_from)?.person ?? null,
    })),
    clients,
    steps: (steps ?? []) as TrackingStep[],
    team: (team ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role as TeamRole,
      person: m.profiles as unknown as Person | null,
    })),
    available: (staff ?? []).filter((p) => !teamIds.has(p.id)),
    canManageTeam: isAdmin,
  };
}

/**
 * Lit l'étape (RLS) pour connaître son dossier, puis contrôle l'accès. Seule façon de retrouver
 * le dossier d'une étape ; seules des colonnes techniques sont lues (aucun texte).
 */
async function loadStep(stepId: string) {
  if (!uuid.safeParse(stepId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: step } = await supabase
    .from("matter_timeline_steps")
    .select("id, matter_id, is_completed")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return null;
  if (!(await assertStaffMatterAccess(step.matter_id))) return null;
  return { supabase, step };
}

export async function addStep(
  matterId: string,
  title: string,
  description: string,
  english: { title?: string | null; description?: string | null } = {},
): Promise<Result> {
  if (!uuid.safeParse(matterId).success) return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from("matter_timeline_steps")
    .select("position")
    .eq("matter_id", matterId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("matter_timeline_steps").insert({
    matter_id: matterId,
    position: (last?.position ?? 0) + 1,
    title,
    description: description || null,
    title_en: english.title || null,
    description_en: english.description || null,
  });
  return error ? fail() : { ok: true };
}

export async function updateStep(stepId: string, title: string, description: string): Promise<Result> {
  const loaded = await loadStep(stepId);
  if (!loaded) return fail("NOT_FOUND");
  const { error } = await loaded.supabase
    .from("matter_timeline_steps")
    .update({ title, description: description || null, title_en: null, description_en: null })
    .eq("id", stepId);
  return error ? fail() : { ok: true };
}

export async function setStepCompleted(stepId: string, completed: boolean): Promise<Result> {
  const loaded = await loadStep(stepId);
  if (!loaded) return fail("NOT_FOUND");
  if (loaded.step.is_completed === completed) return { ok: true };
  const { data, error } = await loaded.supabase
    .from("matter_timeline_steps")
    .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", stepId)
    .select("id")
    .maybeSingle();
  if (error || !data) return fail();
  // Un seul avis par étape toutes les 10 minutes (terminer, rouvrir, terminer à nouveau).
  if (completed && (await hitRateLimit(`stepnotify:${stepId}`, { max: 1, windowSeconds: 600 })))
    await notifyStepCompleted(loaded.step.matter_id);
  return { ok: true };
}

export async function moveStep(stepId: string, direction: -1 | 1): Promise<Result> {
  const loaded = await loadStep(stepId);
  if (!loaded) return fail("NOT_FOUND");
  const { error } = await loaded.supabase.rpc("move_timeline_step", {
    p_step: stepId,
    p_direction: direction,
  });
  return error ? fail() : { ok: true };
}

export async function deleteStep(stepId: string): Promise<Result> {
  const loaded = await loadStep(stepId);
  if (!loaded) return fail("NOT_FOUND");
  const { data, error } = await loaded.supabase
    .from("matter_timeline_steps")
    .delete()
    .eq("id", stepId)
    .select("id");
  return error || !data?.length ? fail() : { ok: true };
}

/** Équipe : firm_admin seulement (revérifié ici, puis par la RLS). */
async function assertTeamManager(matterId: string) {
  if (!uuid.safeParse(matterId).success) return false;
  if (!(await assertStaffMatterAccess(matterId))) return false;
  return (await getSessionRole()) === "firm_admin";
}

export async function addTeamMember(matterId: string, userId: string, role: TeamRole): Promise<Result> {
  if (!uuid.safeParse(userId).success || !(await assertTeamManager(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("matter_team").insert({ matter_id: matterId, user_id: userId, role });
  if (error) return fail(error.code === "23505" ? "DUPLICATE" : "FAILED");
  return { ok: true };
}

export async function removeTeamMember(matterId: string, userId: string): Promise<Result> {
  if (!uuid.safeParse(userId).success || !(await assertTeamManager(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matter_team")
    .delete()
    .eq("matter_id", matterId)
    .eq("user_id", userId)
    .select("user_id");
  return error || !data?.length ? fail() : { ok: true };
}

/**
 * Avis « étape terminée » aux clients ayant un accès ACTIF au dossier (jamais un accès retiré).
 * service_role : création de notifications (usage permis, AGENTS.md §6). Aucun e-mail pour l'instant.
 * Un échec n'annule jamais la modification : il est journalisé (code seulement).
 */
async function notifyStepCompleted(matterId: string) {
  try {
    if (!(await getUser())) return;
    const admin = createSupabaseServiceClient();
    const [{ data: access }, { data: matter }] = await Promise.all([
      admin.from("matter_access").select("user_id").eq("matter_id", matterId).is("revoked_at", null),
      admin.from("matters").select("display_number").eq("id", matterId).maybeSingle(),
    ]);
    const ids = (access ?? []).map((a) => a.user_id);
    if (!ids.length) return;
    const { data: people } = await admin
      .from("profiles")
      .select("id, status, preferred_language")
      .in("id", ids)
      .eq("role", "client");
    for (const person of people ?? []) {
      if (person.status !== "active") continue;
      const locale = person.preferred_language === "fr" ? "fr" : "en";
      const t = await getTranslations({ locale, namespace: "portal.notificationsText" });
      const { error } = await admin.from("notifications").insert({
        user_id: person.id,
        type: "matter_status_changed",
        priority: "success",
        title: t("stepCompletedTitle"),
        body: t("stepCompletedBody", { number: matter?.display_number ?? "—" }),
        matter_id: matterId,
        reference_type: "matter",
        reference_id: matterId,
        action_url: `/portal/matters/${matterId}?tab=timeline`,
      });
      if (error) console.error(JSON.stringify({ event: "step_notification_failed", code: error.code }));
    }
  } catch {
    console.error(JSON.stringify({ event: "step_notify_failed", matter: matterId }));
  }
}

// ---------------------------------------------------------------------------
// Modèles de dossiers (ADR 0019)
// ---------------------------------------------------------------------------

/** Type du dossier (équipe ou firm_admin ; politique matters_staff_update). */
export async function setMatterType(matterId: string, typeId: string | null): Promise<Result> {
  if (!uuid.safeParse(matterId).success || (typeId && !uuid.safeParse(typeId).success))
    return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matters")
    .update({ matter_type_id: typeId })
    .eq("id", matterId)
    .select("id");
  if (error || !data?.length) return fail();
  // Les informations de l'ancien type ne restent pas en base (elles pourraient redevenir lisibles).
  const { data: keep } = typeId
    ? await supabase.from("matter_type_fields").select("id").eq("matter_type_id", typeId)
    : { data: [] as { id: string }[] };
  const keepIds = (keep ?? []).map((f) => f.id);
  let cleanup = supabase.from("matter_field_values").delete().eq("matter_id", matterId);
  if (keepIds.length) cleanup = cleanup.not("field_id", "in", `(${keepIds.join(",")})`);
  await cleanup;
  const user = await getUser();
  await recordAudit({
    action: "matter.type_set",
    resourceType: "matter",
    resourceId: matterId,
    matterId,
    actorId: user?.id ?? null,
    metadata: { matter_type_id: typeId },
  });
  return { ok: true };
}

/** Ajoute à la fin les étapes types du dossier qui n'y figurent pas encore (même titre). */
export async function applyTemplateSteps(matterId: string): Promise<Result & { added?: number }> {
  if (!uuid.safeParse(matterId).success) return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: matter } = await supabase
    .from("matters")
    .select("matter_type_id")
    .eq("id", matterId)
    .maybeSingle();
  const template = matter?.matter_type_id ? await getMatterTypeTemplate(matter.matter_type_id) : null;
  if (!template) return fail("NOT_FOUND");
  const { data: existing } = await supabase
    .from("matter_timeline_steps")
    .select("title, title_en, position")
    .eq("matter_id", matterId);
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const titles = new Set((existing ?? []).flatMap((s) => [norm(s.title), norm(s.title_en)]).filter(Boolean));
  let position = Math.max(0, ...(existing ?? []).map((s) => s.position));
  const rows = template.steps
    .filter((s) => !titles.has(norm(s.title_fr)) && !titles.has(norm(s.title_en)))
    .map((s) => ({
      matter_id: matterId,
      position: ++position,
      title: s.title_fr,
      title_en: s.title_en,
      description: s.description_fr,
      description_en: s.description_en,
    }));
  if (!rows.length) return { ok: true, added: 0 };
  const { error } = await supabase.from("matter_timeline_steps").insert(rows);
  return error ? fail() : { ok: true, added: rows.length };
}

/** Ajoute une étape type précise (version française et anglaise du modèle). */
export async function addTemplateStep(matterId: string, templateStepId: string): Promise<Result> {
  if (!uuid.safeParse(matterId).success || !uuid.safeParse(templateStepId).success) return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: step } = await supabase
    .from("matter_type_steps")
    .select("title_fr, title_en, description_fr, description_en")
    .eq("id", templateStepId)
    .maybeSingle();
  if (!step) return fail("NOT_FOUND");
  return addStep(matterId, step.title_fr, step.description_fr ?? "", {
    title: step.title_en,
    description: step.description_en,
  });
}

/** Enregistre les champs du dossier : valeur vide = champ effacé. */
export async function saveFieldValues(matterId: string, values: Record<string, string>): Promise<Result> {
  if (!uuid.safeParse(matterId).success) return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const ids = Object.keys(values).filter((id) => uuid.safeParse(id).success);
  const { data: defs } = ids.length
    ? await supabase.from("matter_type_fields").select("id, kind").in("id", ids)
    : { data: [] as { id: string; kind: string }[] };
  const kinds = new Map((defs ?? []).map((d) => [d.id, d.kind]));
  const entries = Object.entries(values).filter(([id]) => kinds.has(id));
  for (const [id, raw] of entries) {
    const v = raw.trim();
    if (!v) continue;
    const kind = kinds.get(id);
    if (kind === "date" && !z.iso.date().safeParse(v).success) return fail("FAILED");
    if (kind === "number" && !/^-?\d+([.,]\d+)?$/.test(v)) return fail("FAILED");
  }
  const filled = entries.filter(([, v]) => v.trim() !== "");
  const empty = entries.filter(([, v]) => v.trim() === "").map(([id]) => id);
  if (filled.length) {
    const { error } = await supabase
      .from("matter_field_values")
      .upsert(filled.map(([field_id, value]) => ({ matter_id: matterId, field_id, value: value.trim() })));
    if (error) return fail();
  }
  if (empty.length) {
    const { error } = await supabase
      .from("matter_field_values")
      .delete()
      .eq("matter_id", matterId)
      .in("field_id", empty);
    if (error) return fail();
  }
  const user = await getUser();
  await recordAudit({
    action: "matter.fields_updated",
    resourceType: "matter",
    resourceId: matterId,
    matterId,
    actorId: user?.id ?? null,
    metadata: { fields: entries.length },
  });
  return { ok: true };
}

export const requestStatusSchema = z.enum(["pending", "fulfilled", "cancelled"]);

/** Demande de document au client (accès actif exigé par la base) + avis dans le portail. */
export async function createDocumentRequest(
  matterId: string,
  input: {
    clientId: string;
    templateDocumentId?: string | null;
    title: string;
    description: string;
    dueDate: string | null;
  },
): Promise<Result> {
  if (!uuid.safeParse(matterId).success || !uuid.safeParse(input.clientId).success) return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  let row = {
    title: input.title,
    description: input.description || null,
    title_en: null as string | null,
    description_en: null as string | null,
  };
  if (input.templateDocumentId && uuid.safeParse(input.templateDocumentId).success) {
    const { data: doc } = await supabase
      .from("matter_type_documents")
      .select("title_fr, title_en, description_fr, description_en")
      .eq("id", input.templateDocumentId)
      .maybeSingle();
    if (doc)
      row = {
        title: doc.title_fr,
        description: input.description || doc.description_fr,
        title_en: doc.title_en,
        description_en: input.description ? null : doc.description_en,
      };
  }
  if (!row.title) return fail();
  const { error } = await supabase.from("document_requests").insert({
    matter_id: matterId,
    requested_from: input.clientId,
    due_date: input.dueDate,
    ...row,
  });
  if (error) {
    // Trace serveur (code seulement) : un échec ne passe plus inaperçu (plan, phase 1).
    console.error(JSON.stringify({ event: "document_request_failed", code: error.code }));
    return fail();
  }
  await notifyDocumentRequested(matterId, input.clientId);
  return { ok: true };
}

export async function setDocumentRequestStatus(
  requestId: string,
  status: z.infer<typeof requestStatusSchema>,
): Promise<Result> {
  if (!uuid.safeParse(requestId).success) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  // Lecture technique (RLS) pour connaître le dossier, puis contrôle d'accès (comme loadStep).
  const { data: request } = await supabase
    .from("document_requests")
    .select("id, matter_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || !(await assertStaffMatterAccess(request.matter_id))) return fail("NOT_FOUND");
  const { data, error } = await supabase
    .from("document_requests")
    .update({ status })
    .eq("id", requestId)
    .select("id");
  return error || !data?.length ? fail() : { ok: true };
}

/** Avis « document demandé » au client (service_role : notifications, AGENTS.md §6). */
export async function notifyDocumentRequested(matterId: string, clientId: string) {
  try {
    const admin = createSupabaseServiceClient();
    const [{ data: person }, { data: matter }] = await Promise.all([
      admin.from("profiles").select("id, status, role, preferred_language").eq("id", clientId).maybeSingle(),
      admin.from("matters").select("display_number").eq("id", matterId).maybeSingle(),
    ]);
    if (!person || person.role !== "client" || person.status !== "active") return;
    const locale = person.preferred_language === "fr" ? "fr" : "en";
    const t = await getTranslations({ locale, namespace: "portal.notificationsText" });
    const { error } = await admin.from("notifications").insert({
      user_id: person.id,
      type: "document_requested",
      priority: "urgent",
      title: t("documentRequestedTitle"),
      body: t("documentRequestedBody", { number: matter?.display_number ?? "—" }),
      matter_id: matterId,
      reference_type: "matter",
      reference_id: matterId,
      action_url: "/portal/documents",
    });
    if (error) console.error(JSON.stringify({ event: "request_notification_failed", code: error.code }));
  } catch {
    console.error(JSON.stringify({ event: "request_notify_failed", matter: matterId }));
  }
}
