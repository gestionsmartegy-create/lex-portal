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
import {
  addDeliverable,
  deliverableStatuses,
  linkRequestDocument,
  removeDeliverable,
  setDeliverableStatus,
} from "@/server/services/matter-workspace";
import { localeSchema } from "@/server/validation/auth";

/**
 * Suivi du dossier (ADR 0018) : actions par formulaire, résultat affiché via ?notice=.
 * Entrée validée par Zod ; rôle revérifié (personnel, ou firm_admin pour l'équipe) ;
 * accès au dossier vérifié dans le service, RLS derrière. Redirection interne uniquement.
 */
// Onglet de l'espace « Dossier » où revenir après l'action (ADR 0020).
const workspaceTabs = ["overview", "steps", "documents", "team", "details"] as const;
const base = z.object({
  matterId: z.uuid(),
  locale: localeSchema,
  tab: z.enum(workspaceTabs).catch("overview").default("overview"),
});
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
  | "requestUpdated"
  | "deliverableAdded"
  | "deliverableUpdated"
  | "deliverableRemoved"
  | "documentLinked";

type Tab = (typeof workspaceTabs)[number];

function back(
  locale: string,
  matterId: string,
  notice: Notice | "failed" | "duplicate" | "invalid",
  tab: Tab = "overview",
): never {
  redirect(`/${locale}/admin/matters/${matterId}?tab=${tab}&notice=${notice}`);
}

/**
 * Valide l'entrée. Si le dossier et la langue sont valides mais pas le reste (ex. titre vide),
 * on revient sur la page avec un message ; sinon on s'arrête sans rien révéler.
 */
function parse<T extends z.ZodRawShape>(shape: T, formData: FormData) {
  const raw = Object.fromEntries(formData);
  const ctx = base.safeParse(raw);
  const full = base.extend(shape).safeParse(raw);
  if (!full.success && ctx.success) back(ctx.data.locale, ctx.data.matterId, "invalid", ctx.data.tab);
  return full;
}

export async function addStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ title: stepTitleSchema, description: stepDescriptionSchema.default("") }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await addStep(parsed.data.matterId, parsed.data.title, parsed.data.description);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "added" : "failed", parsed.data.tab);
}

export async function updateStepAction(formData: FormData): Promise<void> {
  const parsed = parse(
    { stepId: z.uuid(), title: stepTitleSchema, description: stepDescriptionSchema.default("") },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await updateStep(parsed.data.stepId, parsed.data.title, parsed.data.description);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "updated" : "failed", parsed.data.tab);
}

export async function toggleStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid(), completed: z.enum(["true", "false"]) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const completed = parsed.data.completed === "true";
  const r = await setStepCompleted(parsed.data.stepId, completed);
  back(
    parsed.data.locale,
    parsed.data.matterId,
    r.ok ? (completed ? "completed" : "reopened") : "failed",
    parsed.data.tab,
  );
}

export async function moveStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid(), direction: z.enum(["up", "down"]) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await moveStep(parsed.data.stepId, parsed.data.direction === "up" ? -1 : 1);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "moved" : "failed", parsed.data.tab);
}

export async function deleteStepAction(formData: FormData): Promise<void> {
  const parsed = parse({ stepId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await deleteStep(parsed.data.stepId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "deleted" : "failed", parsed.data.tab);
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
    parsed.data.tab,
  );
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const parsed = parse({ userId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await removeTeamMember(parsed.data.matterId, parsed.data.userId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "teamRemoved" : "failed", parsed.data.tab);
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
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "typeSet" : "failed", parsed.data.tab);
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
    parsed.data.tab,
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
  if (!templateStepId && !title) back(parsed.data.locale, matterId, "invalid", parsed.data.tab);
  const r = templateStepId
    ? await addTemplateStep(matterId, templateStepId)
    : await addStep(matterId, title, description);
  back(parsed.data.locale, matterId, r.ok ? "added" : "failed", parsed.data.tab);
}

export async function saveFieldsAction(formData: FormData): Promise<void> {
  const parsed = parse({}, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const id = key.startsWith("field:") ? key.slice(6) : null;
    if (id && z.uuid().safeParse(id).success && typeof value === "string") {
      if (value.length > 500) back(parsed.data.locale, parsed.data.matterId, "invalid", parsed.data.tab);
      values[id] = value;
    }
  }
  const r = await saveFieldValues(parsed.data.matterId, values);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "fieldsSaved" : "failed", parsed.data.tab);
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
  if (!templateDocumentId && !title) back(parsed.data.locale, matterId, "invalid", parsed.data.tab);
  const r = await createDocumentRequest(matterId, {
    clientId,
    templateDocumentId,
    title,
    description,
    dueDate,
  });
  back(parsed.data.locale, matterId, r.ok ? "requestCreated" : "failed", parsed.data.tab);
}

export async function requestStatusAction(formData: FormData): Promise<void> {
  const parsed = parse({ requestId: z.uuid(), status: requestStatusSchema }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await setDocumentRequestStatus(parsed.data.requestId, parsed.data.status);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "requestUpdated" : "failed", parsed.data.tab);
}

// ---------------------------------------------------------------------------
// Espace « Dossier » (ADR 0020) : livrables, document lié à une demande
// ---------------------------------------------------------------------------
export async function addDeliverableAction(formData: FormData): Promise<void> {
  const parsed = parse(
    {
      title: stepTitleSchema,
      description: stepDescriptionSchema.default(""),
      dueDate: z
        .string()
        .optional()
        .transform((v) => (v ? v : null))
        .pipe(z.iso.date().nullable()),
      ownerId: optionalUuid,
      visible: z.literal("on").optional(),
    },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const { matterId, title, description, dueDate, ownerId, visible } = parsed.data;
  const r = await addDeliverable(matterId, {
    title,
    description,
    dueDate,
    ownerId,
    visible: visible === "on",
  });
  back(parsed.data.locale, matterId, r.ok ? "deliverableAdded" : "failed", parsed.data.tab);
}

export async function deliverableStatusAction(formData: FormData): Promise<void> {
  const parsed = parse({ deliverableId: z.uuid(), status: z.enum(deliverableStatuses) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await setDeliverableStatus(parsed.data.deliverableId, parsed.data.status);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "deliverableUpdated" : "failed", parsed.data.tab);
}

export async function removeDeliverableAction(formData: FormData): Promise<void> {
  const parsed = parse({ deliverableId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await removeDeliverable(parsed.data.deliverableId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "deliverableRemoved" : "failed", parsed.data.tab);
}

export async function linkRequestDocumentAction(formData: FormData): Promise<void> {
  const parsed = parse({ requestId: z.uuid(), documentId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const r = await linkRequestDocument(parsed.data.requestId, parsed.data.documentId);
  back(parsed.data.locale, parsed.data.matterId, r.ok ? "documentLinked" : "failed", parsed.data.tab);
}
