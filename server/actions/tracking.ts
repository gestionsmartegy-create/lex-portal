"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  addStep,
  addTeamMember,
  addTemplateStep,
  applyTemplateSteps,
  createDocumentRequest,
  deleteStep,
  moveStep,
  removeTeamMember,
  requestStatusSchema,
  saveFieldValues,
  setDocumentRequestStatus,
  setMatterType,
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
  | "added"
  | "updated"
  | "completed"
  | "reopened"
  | "moved"
  | "deleted"
  | "teamAdded"
  | "teamRemoved"
  | "typeSet"
  | "templateApplied"
  | "templateEmpty"
  | "fieldsSaved"
  | "requestCreated"
  | "requestUpdated";

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

// ---------------------------------------------------------------------------
// Modèles de dossiers (ADR 0019)
// ---------------------------------------------------------------------------
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export async function setMatterTypeAction(formData: FormData): Promise<void> {
  const parsed = parse({ typeId: optionalUuid }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await setMatterType(parsed.data.matterId, parsed.data.typeId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "typeSet" : "failed");
}

export async function applyTemplateAction(formData: FormData): Promise<void> {
  const parsed = parse({}, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await applyTemplateSteps(parsed.data.matterId);
  back(
    parsed.data.locale,
    parsed.data.matterId,
    r.ok ? (r.added ? "templateApplied" : "templateEmpty") : "failed",
  );
}

/** Ajout d'une étape : étape type choisie dans la liste, ou étape libre (titre saisi). */
export async function addStepFromListAction(formData: FormData): Promise<void> {
  const parsed = parse(
    {
      templateStepId: optionalUuid,
      title: z.string().trim().max(200).default(""),
      description: stepDescriptionSchema.default(""),
    },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const { matterId, templateStepId, title, description } = parsed.data;
  if (!templateStepId && !title) back(parsed.data.locale, matterId, "invalid");
  const r = templateStepId
    ? await addTemplateStep(matterId, templateStepId)
    : await addStep(matterId, title, description);
  back(parsed.data.locale, matterId, r.ok ? "added" : "failed");
}

export async function saveFieldsAction(formData: FormData): Promise<void> {
  const parsed = parse({}, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const id = key.startsWith("field:") ? key.slice(6) : null;
    if (id && z.uuid().safeParse(id).success && typeof value === "string") {
      if (value.length > 500) back(parsed.data.locale, parsed.data.matterId, "invalid");
      values[id] = value;
    }
  }
  const r = await saveFieldValues(parsed.data.matterId, values);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "fieldsSaved" : "failed");
}

export async function createRequestAction(formData: FormData): Promise<void> {
  const parsed = parse(
    {
      clientId: z.uuid(),
      templateDocumentId: optionalUuid,
      title: z.string().trim().max(200).default(""),
      description: z.string().trim().max(1000).default(""),
      dueDate: z
        .string()
        .optional()
        .transform((v) => (v ? v : null))
        .pipe(z.iso.date().nullable()),
    },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const { matterId, clientId, templateDocumentId, title, description, dueDate } = parsed.data;
  if (!templateDocumentId && !title) back(parsed.data.locale, matterId, "invalid");
  const r = await createDocumentRequest(matterId, {
    clientId,
    templateDocumentId,
    title,
    description,
    dueDate,
  });
  back(parsed.data.locale, matterId, r.ok ? "requestCreated" : "failed");
}

export async function requestStatusAction(formData: FormData): Promise<void> {
  const parsed = parse({ requestId: z.uuid(), status: requestStatusSchema }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await setDocumentRequestStatus(parsed.data.requestId, parsed.data.status);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "requestUpdated" : "failed");
}
