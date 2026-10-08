"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  addTemplateItem,
  createMatterType,
  descriptionSchema,
  fieldKindSchema,
  moveTemplateItem,
  nameSchema,
  practiceGroups,
  removeTemplateItem,
  templateItemKinds,
  updateMatterType,
  updateTemplateItem,
  type TemplateItemInput,
} from "@/server/services/matter-templates";
import { createTag, tagColors, updateTag } from "@/server/services/matter-tags";
import { localeSchema } from "@/server/validation/auth";

/**
 * Modèles de dossiers (ADR 0019) : firm_admin seulement (requireStaff + RLS).
 * Entrée validée par Zod ; résultat affiché via ?notice= ; redirection interne uniquement.
 */
type Notice = "created" | "saved" | "added" | "removed" | "moved" | "failed" | "invalid";
const groupSchema = z.enum(practiceGroups);
const kindSchema = z.enum(templateItemKinds);

function toType(locale: string, typeId: string, notice: Notice): never {
  redirect(`/${locale}/admin/templates/${typeId}?notice=${notice}`);
}

export async function createTypeAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ locale: localeSchema, group: groupSchema, nameFr: nameSchema, nameEn: nameSchema })
    .safeParse(Object.fromEntries(formData));
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  if (!parsed.success) redirect(`/${locale}/admin/templates?notice=invalid`);
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await createMatterType({
    group: parsed.data.group,
    nameFr: parsed.data.nameFr,
    nameEn: parsed.data.nameEn,
  });
  if (!r.ok || !r.id) redirect(`/${parsed.data.locale}/admin/templates?notice=failed`);
  toType(parsed.data.locale, r.id, "created");
}

const typeForm = z.object({ locale: localeSchema, typeId: z.uuid() });

/** Valide ; si seul le contenu est invalide, retour sur la page du type avec un message. */
function parse<T extends z.ZodRawShape>(shape: T, formData: FormData) {
  const raw = Object.fromEntries(formData);
  const full = typeForm.extend(shape).safeParse(raw);
  if (!full.success) {
    const ctx = typeForm.safeParse(raw);
    if (ctx.success) toType(ctx.data.locale, ctx.data.typeId, "invalid");
  }
  return full;
}

export async function updateTypeAction(formData: FormData): Promise<void> {
  const parsed = parse(
    { group: groupSchema, nameFr: nameSchema, nameEn: nameSchema, active: z.literal("on").optional() },
    formData,
  );
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await updateMatterType(parsed.data.typeId, {
    group: parsed.data.group,
    nameFr: parsed.data.nameFr,
    nameEn: parsed.data.nameEn,
    active: parsed.data.active === "on",
  });
  toType(parsed.data.locale, parsed.data.typeId, r.ok ? "saved" : "failed");
}

const itemShape = {
  kind: kindSchema,
  fr: nameSchema,
  en: nameSchema,
  descFr: descriptionSchema.default(""),
  descEn: descriptionSchema.default(""),
  fieldKind: fieldKindSchema.default("text"),
  visible: z.literal("on").optional(),
};

function toInput(d: {
  kind: z.infer<typeof kindSchema>;
  fr: string;
  en: string;
  descFr: string;
  descEn: string;
  fieldKind: "text" | "date" | "number";
  visible?: "on";
}): TemplateItemInput {
  return d.kind === "fields"
    ? { kind: "fields", fr: d.fr, en: d.en, fieldKind: d.fieldKind, visible: d.visible === "on" }
    : { kind: d.kind, fr: d.fr, en: d.en, descFr: d.descFr, descEn: d.descEn };
}

export async function addItemAction(formData: FormData): Promise<void> {
  const parsed = parse(itemShape, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await addTemplateItem(parsed.data.typeId, toInput(parsed.data));
  toType(parsed.data.locale, parsed.data.typeId, r.ok ? "added" : "failed");
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const parsed = parse({ ...itemShape, itemId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await updateTemplateItem(parsed.data.itemId, toInput(parsed.data));
  toType(parsed.data.locale, parsed.data.typeId, r.ok ? "saved" : "failed");
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const parsed = parse({ kind: kindSchema, itemId: z.uuid() }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await removeTemplateItem(parsed.data.kind, parsed.data.itemId);
  toType(parsed.data.locale, parsed.data.typeId, r.ok ? "removed" : "failed");
}

export async function moveItemAction(formData: FormData): Promise<void> {
  const parsed = parse({ kind: kindSchema, itemId: z.uuid(), direction: z.enum(["up", "down"]) }, formData);
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await moveTemplateItem(
    parsed.data.kind,
    parsed.data.itemId,
    parsed.data.direction === "up" ? -1 : 1,
  );
  toType(parsed.data.locale, parsed.data.typeId, r.ok ? "moved" : "failed");
}

// ---------------------------------------------------------------------------
// Étiquettes (ADR 0021) : firm_admin seulement ; retour sur la page des modèles.
// ---------------------------------------------------------------------------
const tagShape = {
  locale: localeSchema,
  nameFr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  color: z.enum(tagColors),
  visible: z.literal("on").optional(),
};

export async function createTagAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const parsed = z.object(tagShape).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/templates?notice=invalid`);
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await createTag({
    nameFr: parsed.data.nameFr,
    nameEn: parsed.data.nameEn,
    color: parsed.data.color,
    visible: parsed.data.visible === "on",
  });
  redirect(`/${parsed.data.locale}/admin/templates?notice=${r.ok ? "tagSaved" : "failed"}`);
}

export async function updateTagAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const parsed = z
    .object({ ...tagShape, tagId: z.uuid(), active: z.literal("on").optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/templates?notice=invalid`);
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const r = await updateTag(parsed.data.tagId, {
    nameFr: parsed.data.nameFr,
    nameEn: parsed.data.nameEn,
    color: parsed.data.color,
    visible: parsed.data.visible === "on",
    active: parsed.data.active === "on",
  });
  redirect(`/${parsed.data.locale}/admin/templates?notice=${r.ok ? "tagSaved" : "failed"}`);
}
