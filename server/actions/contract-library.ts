"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  clauseSchema,
  createTemplateFromContract,
  openTemplateDraft,
  publishTemplateDraft,
  saveClause,
  saveService,
  saveTaxRate,
  serviceSchema,
  taxRateSchema,
  templateFromContractSchema,
  templateUpdateSchema,
  updateTemplate,
} from "@/server/services/contract-library";
import { saveLines } from "@/server/services/contracts";
import { localeSchema } from "@/server/validation/auth";
import {
  aiSettingsSchema,
  aiTemplateSchema,
  generateAiTemplate,
  saveAiSettings,
} from "@/server/services/ai-admin";

/**
 * Bibliothèque des contrats (ADR 0034). Chaque action revérifie la session et le rôle (requireStaff ;
 * firm_admin pour toute écriture de la bibliothèque) et valide son entrée avec Zod ; la base revérifie.
 */
type Outcome = { ok: true } | { ok: false; code: string };
const loc = (v: unknown) => localeSchema.catch("en").parse(v);
const id = z.uuid();

/** Tableau des services d'un contrat (verrou exigé par la base). */
export async function saveLinesAction(locale: string, contractId: string, input: unknown): Promise<Outcome> {
  await requireStaff(loc(locale));
  if (!id.safeParse(contractId).success) return { ok: false, code: "INVALID" };
  const r = await saveLines(contractId, input);
  return r.ok ? { ok: true } : { ok: false, code: r.code };
}

export async function templateFromContractAction(locale: string, input: unknown): Promise<Outcome> {
  await requireStaff(loc(locale), ["firm_admin"]);
  const parsed = templateFromContractSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const r = await createTemplateFromContract(parsed.data);
  return r.ok ? { ok: true } : { ok: false, code: r.code };
}

export async function publishTemplateAction(locale: string, contractId: string): Promise<Outcome> {
  await requireStaff(loc(locale), ["firm_admin"]);
  if (!id.safeParse(contractId).success) return { ok: false, code: "INVALID" };
  const r = await publishTemplateDraft(contractId);
  return r.ok ? { ok: true } : { ok: false, code: r.code };
}

/** Formulaires des pages de la bibliothèque (redirection avec un avis). */
function back(locale: string, page: "templates" | "clauses" | "services", notice: string): never {
  redirect(`/${locale}/admin/contracts/${page}?notice=${notice}`);
}

export async function openTemplateDraftAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = id.safeParse(formData.get("templateId"));
  if (!parsed.success) back(locale, "templates", "failed");
  const r = await openTemplateDraft(parsed.data);
  if (!r.ok) back(locale, "templates", "failed");
  redirect(`/${locale}/admin/contracts/${r.data}`);
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = templateUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "templates", "invalid");
  const r = await updateTemplate(parsed.data);
  back(locale, "templates", r.ok ? "saved" : "failed");
}

export async function saveClauseAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = clauseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "clauses", "invalid");
  const r = await saveClause(parsed.data);
  back(locale, "clauses", r.ok ? "saved" : "failed");
}

export async function saveServiceAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "services", "invalid");
  const r = await saveService(parsed.data);
  back(locale, "services", r.ok ? "saved" : "failed");
}

export async function saveTaxRateAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = taxRateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "services", "invalid");
  const r = await saveTaxRate(parsed.data);
  back(locale, "services", r.ok ? "taxSaved" : "failed");
}

/** Gabarit proposé par l'assistant IA (ADR 0037, F13) : brouillon « à faire valider ». firm_admin. */
export async function aiTemplateAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = aiTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "templates", "aiInvalid");
  const r = await generateAiTemplate(parsed.data);
  if (!r.ok)
    back(
      locale,
      "templates",
      r.code === "BUDGET_EXCEEDED" ? "aiBudget" : r.code === "DISABLED" ? "aiDisabled" : "failed",
    );
  back(locale, "templates", "aiDraft");
}

/** Réglages de l'assistant IA (ADR 0037, F14) : activé, plafond mensuel, prix estimé. firm_admin. */
export async function aiSettingsAction(formData: FormData): Promise<void> {
  const locale = loc(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = aiSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/integrations?notice=aiInvalid`);
  const r = await saveAiSettings(parsed.data);
  redirect(`/${locale}/admin/integrations?notice=${r.ok ? "aiSaved" : "aiFailed"}`);
}
