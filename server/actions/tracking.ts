"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  addStep,
  addTeamMember,
  deleteStep,
  moveStep,
  removeTeamMember,
  setStepCompleted,
  stepDescriptionSchema,
  stepTitleSchema,
  teamRoleSchema,
  updateStep,
} from "@/server/services/matter-tracking";
import { localeSchema } from "@/server/validation/auth";

/**
 * Suivi du dossier (ADR 0018) : actions par formulaire, résultat affiché via ?notice=.
 * Entrée validée par Zod ; rôle revérifié (personnel, ou firm_admin pour l'équipe) ;
 * accès au dossier vérifié dans le service, RLS derrière. Redirection interne uniquement.
 */
const base = z.object({ matterId: z.uuid(), locale: localeSchema });
type Notice =
  "added" | "updated" | "completed" | "reopened" | "moved" | "deleted" | "teamAdded" | "teamRemoved";

function back(locale: string, matterId: string, notice: Notice | "failed" | "duplicate" | "invalid"): never {
  redirect(`/${locale}/admin/matters/${matterId}/tracking?notice=${notice}`);
}

/**
 * Valide l'entrée. Si le dossier et la langue sont valides mais pas le reste (ex. titre vide),
 * on revient sur la page avec un message ; sinon on s'arrête sans rien révéler.
 */
function parse<T extends z.ZodRawShape>(shape: T, formData: FormData) {
  const raw = Object.fromEntries(formData);
  const full = base.extend(shape).safeParse(raw);
  if (!full.success) {
    const ctx = base.safeParse(raw);
    if (ctx.success) back(ctx.data.locale, ctx.data.matterId, "invalid");
  }
  return full;
}

export async function addStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ title: stepTitleSchema, description: stepDescriptionSchema.default("") }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await addStep(parsed.data.matterId, parsed.data.title, parsed.data.description);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "added" : "failed");
}

export async function updateStepAction(formData: FormData): Promise<void> {
  const parsed = parse(
    { stepId: z.uuid(), title: stepTitleSchema, description: stepDescriptionSchema.default("") },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await updateStep(parsed.data.stepId, parsed.data.title, parsed.data.description);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "updated" : "failed");
}

export async function toggleStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid(), completed: z.enum(["true", "false"]) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const completed = parsed.data.completed === "true";
  const r = await setStepCompleted(parsed.data.stepId, completed);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? (completed ? "completed" : "reopened") : "failed");
}

export async function moveStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid(), direction: z.enum(["up", "down"]) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await moveStep(parsed.data.stepId, parsed.data.direction === "up" ? -1 : 1);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "moved" : "failed");
}

export async function deleteStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await deleteStep(parsed.data.stepId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "deleted" : "failed");
}

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const parsed = parse({ userId: z.uuid(), role: teamRoleSchema }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await addTeamMember(parsed.data.matterId, parsed.data.userId, parsed.data.role);
  back(
    parsed.data.locale,
    parsed.data.matterId,
    r.ok ? "teamAdded" : r.code === "DUPLICATE" ? "duplicate" : "failed",
  );
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const parsed = parse({ userId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await removeTeamMember(parsed.data.matterId, parsed.data.userId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "teamRemoved" : "failed");
}
