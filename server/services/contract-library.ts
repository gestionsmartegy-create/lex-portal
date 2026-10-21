import "server-only";
import { z } from "zod";
import { contractDocSchema, type ContractDoc } from "@/lib/contract-doc";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import type { Json } from "@/types/database";

/**
 * Bibliothèque des contrats, lot 2 (ADR 0034) : modèles versionnés, clauses, catalogue des services,
 * taux de taxes. Tout est lu et écrit sous la session (RLS) : lecture par le personnel, écriture par le
 * firm_admin (revérifiée par la base). Aucun service_role.
 */
export const contractDomains = ["immigration", "legal", "business", "advisory", "other"] as const;
export const provinces = ["NB", "NS", "ON", "QC", "PE", "NL", "other"] as const;
export type Province = (typeof provinces)[number];
export const signingModes = ["clio", "portal", "both"] as const;

const uuid = z.uuid();
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/);
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));

async function role() {
  const r = await getSessionRole();
  return r === "staff" || r === "firm_admin" ? r : null;
}

type Fail = "NOT_FOUND" | "INVALID" | "FAILED" | "FORBIDDEN";
export type LibResult<T = undefined> = { ok: true; data: T } | { ok: false; code: Fail };
const fail = (code: Fail) => ({ ok: false as const, code });
const ok = <T>(data: T) => ({ ok: true as const, data });
const dbFail = (code?: string): Fail =>
  code === "42501" ? "FORBIDDEN" : code === "23514" ? "INVALID" : "FAILED";

// ---------------------------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------------------------
export async function listTemplates() {
  if (!(await role())) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contract_templates")
    .select(
      "id, name, description, domain, language, signing, status, needs_review, current_version, is_mock, updated_at",
    )
    .order("status")
    .order("name");
  return data ?? [];
}

export const templateLineSchema = z.object({
  description: line(300),
  pricing: z.enum(["flat", "hourly"]),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/),
  unit_price: amount,
  service_id: uuid.nullable().optional(),
});
export type TemplateLine = z.infer<typeof templateLineSchema>;

/** Dernière version d'un modèle visible (publié, ou brouillon pour le firm_admin) : sections validées. */
export async function getTemplateVersion(templateId: string) {
  if (!(await role()) || !uuid.safeParse(templateId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from("contract_templates")
    .select("id, name, language, status, current_version")
    .eq("id", templateId)
    .maybeSingle();
  if (!t || t.current_version < 1) return null;
  const { data: v } = await supabase
    .from("contract_template_versions")
    .select("version, sections, line_items")
    .eq("template_id", templateId)
    .eq("version", t.current_version)
    .maybeSingle();
  if (!v) return null;
  const sections = (Array.isArray(v.sections) ? v.sections : [])
    .map((s) => {
      const row = s as { title?: unknown; body?: unknown };
      const body = contractDocSchema.safeParse(row.body);
      const title = typeof row.title === "string" ? row.title.slice(0, 200) : "";
      return body.success ? { title, body: body.data as ContractDoc } : null;
    })
    .filter((x): x is { title: string; body: ContractDoc } => Boolean(x));
  const lines = (Array.isArray(v.line_items) ? v.line_items : [])
    .map((l) => templateLineSchema.safeParse(l))
    .filter((r) => r.success)
    .map((r) => r.data);
  return { template: t, version: v.version, sections, lines };
}

export const templateFromContractSchema = z.object({
  contractId: uuid,
  name: line(200),
  domain: z.enum(contractDomains),
  signing: z.enum(signingModes),
  description: z.string().trim().max(1000).optional(),
});

export async function createTemplateFromContract(
  input: z.infer<typeof templateFromContractSchema>,
): Promise<LibResult<string>> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_template_from_contract", {
    p_contract: input.contractId,
    p_name: input.name,
    p_domain: input.domain,
    p_signing: input.signing,
    p_description: input.description ?? "",
  });
  return error || !data ? fail(dbFail(error?.code)) : ok(data);
}

/** Ouvrir un brouillon d'un modèle dans l'éditeur (firm_admin) : un contrat « template_draft ». */
export async function openTemplateDraft(templateId: string): Promise<LibResult<string>> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const loaded = await getTemplateVersion(templateId);
  if (!loaded) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      title: loaded.template.name,
      language: loaded.template.language,
      client_name: loaded.template.language === "fr" ? "Modèle" : "Template",
      client_language: loaded.template.language,
      template_id: templateId,
      template_version: loaded.version,
      template_draft: true,
    })
    .select("id")
    .single();
  if (error || !data) return fail(dbFail(error?.code));
  if (!(await copyTemplateContent(data.id, loaded.sections, loaded.lines))) return fail("FAILED");
  return ok(data.id);
}

/**
 * Copie les sections et le tableau des services d'une version (verrou de l'auteur, posé à la création).
 * Renvoie faux si une écriture échoue : l'appelant signale l'échec au lieu d'ouvrir un contrat vide.
 */
export async function copyTemplateContent(
  contractId: string,
  sections: { title: string; body: ContractDoc }[],
  lines: TemplateLine[],
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (sections.length) {
    const { error } = await supabase.from("contract_sections").insert(
      sections.slice(0, 199).map((s, position) => ({
        contract_id: contractId,
        position,
        title: s.title,
        body: s.body as unknown as NonNullable<Json>,
      })),
    );
    if (error) return false;
  }
  if (lines.length) {
    const { error } = await supabase.from("contract_line_items").insert(
      lines.slice(0, 100).map((l, position) => ({
        contract_id: contractId,
        position,
        description: l.description,
        pricing: l.pricing,
        quantity: l.quantity as unknown as number,
        unit_price: l.unit_price as unknown as number,
        service_id: l.service_id ?? null,
      })),
    );
    if (error) return false;
  }
  return true;
}

export async function publishTemplateDraft(contractId: string): Promise<LibResult<number>> {
  if ((await role()) !== "firm_admin" || !uuid.safeParse(contractId).success) return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_template_publish", { p_contract: contractId });
  return error || !data ? fail(dbFail(error?.code)) : ok(data);
}

export const templateUpdateSchema = z.object({
  id: uuid,
  name: line(200),
  description: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v))
    .optional(),
  domain: z.enum(contractDomains),
  signing: z.enum(signingModes),
  status: z.enum(["published", "archived"]),
});

export async function updateTemplate(input: z.infer<typeof templateUpdateSchema>): Promise<LibResult> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contract_templates")
    .update({
      name: input.name,
      description: input.description || null,
      domain: input.domain,
      signing: input.signing,
      status: input.status,
    })
    .eq("id", input.id)
    .neq("status", "draft")
    .select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

// ---------------------------------------------------------------------------------------------
// Clauses
// ---------------------------------------------------------------------------------------------
export async function listClauses(language?: "fr" | "en") {
  if (!(await role())) return [];
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("contract_clauses")
    .select("id, title, language, domain, body, is_active, version, updated_at")
    .order("title");
  if (language) q = q.eq("language", language).eq("is_active", true);
  const { data } = await q;
  return data ?? [];
}

export const clauseSchema = z.object({
  id: uuid.optional().or(z.literal("").transform(() => undefined)),
  title: line(200),
  language: z.enum(["fr", "en"]),
  domain: z.enum(contractDomains),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().min(1).max(20000))
    .refine((v) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v)),
  isActive: z.enum(["true", "false"]).optional(),
});

export async function saveClause(input: z.infer<typeof clauseSchema>): Promise<LibResult> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const row = {
    title: input.title,
    language: input.language,
    domain: input.domain,
    body: input.body,
    is_active: input.isActive !== "false",
  };
  const { data, error } = input.id
    ? await supabase.from("contract_clauses").update(row).eq("id", input.id).select("id")
    : await supabase.from("contract_clauses").insert(row).select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

// ---------------------------------------------------------------------------------------------
// Services et taxes
// ---------------------------------------------------------------------------------------------
export async function listServices(activeOnly = false) {
  if (!(await role())) return [];
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("service_catalog")
    .select(
      "id, name_fr, name_en, description_fr, description_en, domain, pricing, amount::text, is_active, position, is_mock",
    )
    .order("position")
    .order("name_fr");
  if (activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as unknown as {
    id: string;
    name_fr: string;
    name_en: string;
    description_fr: string | null;
    description_en: string | null;
    domain: string;
    pricing: "flat" | "hourly";
    amount: string;
    is_active: boolean;
    position: number;
    is_mock: boolean;
  }[];
}

export const serviceSchema = z.object({
  id: uuid.optional().or(z.literal("").transform(() => undefined)),
  nameFr: line(200),
  nameEn: line(200),
  domain: z.enum(contractDomains),
  pricing: z.enum(["flat", "hourly"]),
  amount,
  isActive: z.enum(["true", "false"]).optional(),
});

export async function saveService(input: z.infer<typeof serviceSchema>): Promise<LibResult> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const row = {
    name_fr: input.nameFr,
    name_en: input.nameEn,
    domain: input.domain,
    pricing: input.pricing,
    amount: input.amount as unknown as number,
    is_active: input.isActive !== "false",
  };
  const { data, error } = input.id
    ? await supabase.from("service_catalog").update(row).eq("id", input.id).select("id")
    : await supabase.from("service_catalog").insert(row).select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

export type TaxRate = {
  id: string;
  province: Province;
  tax_code: string;
  rate: string;
  effective_from: string;
  effective_to: string | null;
  needs_verification: boolean;
};

export async function listTaxRates(): Promise<TaxRate[]> {
  if (!(await role())) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tax_rates")
    .select("id, province, tax_code, rate::text, effective_from, effective_to, needs_verification")
    .order("province")
    .order("effective_from", { ascending: false });
  return (data ?? []) as unknown as TaxRate[];
}

/** Taux en vigueur à une date (AAAA-MM-JJ) pour une province. */
export function ratesFor(all: TaxRate[], province: Province | null, day: string) {
  if (!province) return [];
  const live = all.filter(
    (r) => r.province === province && r.effective_from <= day && (!r.effective_to || r.effective_to > day),
  );
  // Un seul taux par code de taxe : le plus récent.
  const byCode = new Map<string, TaxRate>();
  for (const r of live.sort((a, b) => b.effective_from.localeCompare(a.effective_from)))
    if (!byCode.has(r.tax_code)) byCode.set(r.tax_code, r);
  return [...byCode.values()];
}

export const taxRateSchema = z.object({
  id: uuid.optional().or(z.literal("").transform(() => undefined)),
  province: z.enum(provinces),
  taxCode: z.enum(["HST", "GST", "QST", "PST"]),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,3})?$/),
  effectiveFrom: z.iso.date(),
  verified: z.enum(["true", "false"]).optional(),
});

export async function saveTaxRate(input: z.infer<typeof taxRateSchema>): Promise<LibResult> {
  if ((await role()) !== "firm_admin") return fail("FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  const row = {
    rate: input.rate as unknown as number,
    effective_from: input.effectiveFrom,
    needs_verification: input.verified !== "true",
  };
  const { error } = input.id
    ? await supabase.from("tax_rates").update(row).eq("id", input.id)
    : await supabase.from("tax_rates").insert({ ...row, province: input.province, tax_code: input.taxCode });
  return error ? fail(dbFail(error.code)) : ok(undefined);
}

export async function currentUserId() {
  return (await getUser())?.id ?? null;
}
