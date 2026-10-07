import "server-only";
import { z } from "zod";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

/**
 * Modèles de dossiers (ADR 0019) : types de dossier, étapes types, documents types, champs.
 * Lecture : personnel (RLS *_staff_select). Écriture : firm_admin, revérifié ici puis par la RLS.
 * Aucune donnée de client dans ces tables : ce sont des réglages du cabinet.
 */
const uuid = z.uuid();
export const practiceGroups = ["legal", "business", "advisory"] as const;
export type PracticeGroup = (typeof practiceGroups)[number];
export const templateItemKinds = ["steps", "documents", "fields"] as const;
export type TemplateItemKind = (typeof templateItemKinds)[number];
const TABLE = {
  steps: "matter_type_steps",
  documents: "matter_type_documents",
  fields: "matter_type_fields",
} as const;

export const nameSchema = z.string().trim().min(1).max(200);
export const descriptionSchema = z.string().trim().max(1000);
export const fieldKindSchema = z.enum(["text", "date", "number"]);

export type MatterType = {
  id: string;
  code: string;
  practice_group: PracticeGroup;
  name_fr: string;
  name_en: string;
  position: number;
  is_active: boolean;
};
export type TemplateStep = {
  id: string;
  position: number;
  title_fr: string;
  title_en: string;
  description_fr: string | null;
  description_en: string | null;
};
export type TemplateField = {
  id: string;
  position: number;
  label_fr: string;
  label_en: string;
  kind: "text" | "date" | "number";
  visible_to_client: boolean;
};

type Result = { ok: true; id?: string } | { ok: false; code: "NOT_FOUND" | "FAILED" | "DUPLICATE" };

async function isAdmin() {
  return (await getSessionRole()) === "firm_admin";
}

export async function listMatterTypes(opts: { activeOnly?: boolean } = {}): Promise<MatterType[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matter_types")
    .select("id, code, practice_group, name_fr, name_en, position, is_active")
    .order("position");
  if (opts.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as MatterType[];
}

export async function getMatterTypeTemplate(typeId: string) {
  if (!uuid.safeParse(typeId).success) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: type }, { data: steps }, { data: documents }, { data: fields }] = await Promise.all([
    supabase
      .from("matter_types")
      .select("id, code, practice_group, name_fr, name_en, position, is_active")
      .eq("id", typeId)
      .maybeSingle(),
    supabase
      .from("matter_type_steps")
      .select("id, position, title_fr, title_en, description_fr, description_en")
      .eq("matter_type_id", typeId)
      .order("position"),
    supabase
      .from("matter_type_documents")
      .select("id, position, title_fr, title_en, description_fr, description_en")
      .eq("matter_type_id", typeId)
      .order("position"),
    supabase
      .from("matter_type_fields")
      .select("id, position, label_fr, label_en, kind, visible_to_client")
      .eq("matter_type_id", typeId)
      .order("position"),
  ]);
  if (!type) return null;
  return {
    type: type as MatterType,
    steps: (steps ?? []) as TemplateStep[],
    documents: (documents ?? []) as TemplateStep[],
    fields: (fields ?? []) as TemplateField[],
  };
}

/** Code technique stable dérivé du nom (minuscules, sans accents). */
function toCode(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${base || "type"}_${Date.now().toString(36)}`;
}

export async function createMatterType(input: {
  group: PracticeGroup;
  nameFr: string;
  nameEn: string;
}): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from("matter_types")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("matter_types")
    .insert({
      code: toCode(input.nameFr),
      practice_group: input.group,
      name_fr: input.nameFr,
      name_en: input.nameEn,
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single();
  return error || !data ? { ok: false, code: "FAILED" } : { ok: true, id: data.id };
}

export async function updateMatterType(
  typeId: string,
  input: { group: PracticeGroup; nameFr: string; nameEn: string; active: boolean },
): Promise<Result> {
  if (!uuid.safeParse(typeId).success || !(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matter_types")
    .update({
      practice_group: input.group,
      name_fr: input.nameFr,
      name_en: input.nameEn,
      is_active: input.active,
    })
    .eq("id", typeId)
    .select("id");
  return error || !data?.length ? { ok: false, code: "FAILED" } : { ok: true };
}

export type TemplateItemInput =
  | { kind: "steps" | "documents"; fr: string; en: string; descFr: string; descEn: string }
  | { kind: "fields"; fr: string; en: string; fieldKind: "text" | "date" | "number"; visible: boolean };

async function nextPosition(table: (typeof TABLE)[TemplateItemKind], typeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from(table)
    .select("position")
    .eq("matter_type_id", typeId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.position ?? 0) + 1;
}

export async function addTemplateItem(typeId: string, input: TemplateItemInput): Promise<Result> {
  if (!uuid.safeParse(typeId).success || !(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  const position = await nextPosition(TABLE[input.kind], typeId);
  const { error } =
    input.kind === "fields"
      ? await supabase.from("matter_type_fields").insert({
          matter_type_id: typeId,
          position,
          label_fr: input.fr,
          label_en: input.en,
          kind: input.fieldKind,
          visible_to_client: input.visible,
        })
      : await supabase.from(TABLE[input.kind]).insert({
          matter_type_id: typeId,
          position,
          title_fr: input.fr,
          title_en: input.en,
          description_fr: input.descFr || null,
          description_en: input.descEn || null,
        });
  return error ? { ok: false, code: "FAILED" } : { ok: true };
}

export async function updateTemplateItem(itemId: string, input: TemplateItemInput): Promise<Result> {
  if (!uuid.safeParse(itemId).success || !(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  // Le genre d'un champ déjà rempli ne change pas : la base refuse (trigger), d'où « FAILED ».
  const { data, error } =
    input.kind === "fields"
      ? await supabase
          .from("matter_type_fields")
          .update({
            label_fr: input.fr,
            label_en: input.en,
            kind: input.fieldKind,
            visible_to_client: input.visible,
          })
          .eq("id", itemId)
          .select("id")
      : await supabase
          .from(TABLE[input.kind])
          .update({
            title_fr: input.fr,
            title_en: input.en,
            description_fr: input.descFr || null,
            description_en: input.descEn || null,
          })
          .eq("id", itemId)
          .select("id");
  return error || !data?.length ? { ok: false, code: "FAILED" } : { ok: true };
}

export async function removeTemplateItem(kind: TemplateItemKind, itemId: string): Promise<Result> {
  if (!uuid.safeParse(itemId).success || !(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(TABLE[kind]).delete().eq("id", itemId).select("id");
  return error || !data?.length ? { ok: false, code: "FAILED" } : { ok: true };
}

/** Monter ou descendre un élément : échange des positions (pas de contrainte d'unicité ici). */
export async function moveTemplateItem(
  kind: TemplateItemKind,
  itemId: string,
  direction: -1 | 1,
): Promise<Result> {
  if (!uuid.safeParse(itemId).success || !(await isAdmin())) return { ok: false, code: "NOT_FOUND" };
  const supabase = await createSupabaseServerClient();
  const table = TABLE[kind];
  const { data: item } = await supabase
    .from(table)
    .select("id, matter_type_id, position")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, code: "NOT_FOUND" };
  const { data: siblings } = await supabase
    .from(table)
    .select("id, position")
    .eq("matter_type_id", item.matter_type_id)
    .order("position");
  const list = siblings ?? [];
  const index = list.findIndex((s) => s.id === itemId);
  const other = list[index + direction];
  if (!other) return { ok: true };
  const a = await supabase.from(table).update({ position: other.position }).eq("id", item.id);
  const b = await supabase.from(table).update({ position: item.position }).eq("id", other.id);
  return a.error || b.error ? { ok: false, code: "FAILED" } : { ok: true };
}

/** Libellé dans la langue demandée (le français par défaut si la traduction manque). */
export function pick(locale: string, fr: string, en: string | null | undefined) {
  return locale === "en" && en ? en : fr;
}
