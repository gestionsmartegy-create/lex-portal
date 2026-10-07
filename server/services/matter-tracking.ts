import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { MatterStatus } from "@/types/domain";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { hitRateLimit } from "@/server/security/rate-limit";
import { assertMatterAccess } from "@/server/services/access-control";

/**
 * Suivi du dossier par le cabinet (ADR 0018).
 * - Étapes : équipe du dossier ou firm_admin. `assertMatterAccess(…, "read_write")` AVANT toute
 *   lecture ou écriture (AGENTS.md §2.4) ; la RLS revérifie (timeline_staff_*). L'avancement et
 *   l'audit sont tenus par la base (triggers de la migration 20261007120000).
 * - Équipe : firm_admin seulement (RLS matter_team_admin_*) ; l'audit est tenu par la base.
 * - Une étape terminée avertit les clients ayant un accès actif (notification dans le portail).
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
async function assertStaffMatterAccess(matterId: string) {
  await assertMatterAccess(matterId, "read_write");
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}

export type TrackingStep = {
  id: string;
  position: number;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
};
type Person = { first_name: string | null; last_name: string | null; email: string };

export async function getMatterTracking(matterId: string) {
  if (!uuid.safeParse(matterId).success) return null;
  if (!(await assertStaffMatterAccess(matterId))) return null;
  const supabase = await createSupabaseServerClient();
  const isAdmin = (await getSessionRole()) === "firm_admin";
  const [{ data: matter }, { data: steps }, { data: team }, { data: staff }] = await Promise.all([
    supabase
      .from("matters")
      .select("id, display_number, title, practice_area, status, progress_percent, is_mock")
      .eq("id", matterId)
      .maybeSingle(),
    supabase
      .from("matter_timeline_steps")
      .select("id, position, title, description, is_completed, completed_at")
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
  ]);
  if (!matter) return null;
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
    },
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

export async function addStep(matterId: string, title: string, description: string): Promise<Result> {
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
  });
  return error ? fail() : { ok: true };
}

export async function updateStep(stepId: string, title: string, description: string): Promise<Result> {
  const loaded = await loadStep(stepId);
  if (!loaded) return fail("NOT_FOUND");
  const { error } = await loaded.supabase
    .from("matter_timeline_steps")
    .update({ title, description: description || null })
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
