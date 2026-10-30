import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import { formatDecimal, formatMoney } from "@/lib/format";
import { fromCents, lineTotal } from "@/lib/money";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { hitRateLimit } from "@/server/security/rate-limit";
import { notifyContractSent } from "@/server/services/client-notifier";
import { recordAudit } from "@/server/services/audit";
import { renderContractDocx } from "@/server/services/contract-docx";
import { renderContractPdf, type PdfInput } from "@/server/services/contract-pdf";
import { getContract } from "@/server/services/contracts";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";

/**
 * Contrats, lot 3 (ADR 0036) : valider (PDF officiel + empreinte), revenir au brouillon, relancer,
 * nouvelle version, rattacher à un dossier, commentaires de relecture, lecture du PDF.
 * Tout passe par la session de l'utilisateur ; la base revérifie chaque règle (rôle, statut, verrou).
 * Un contrat lié à un dossier passe d'abord par assertMatterAccess (AGENTS.md §2.4).
 */
type Fail = "NOT_FOUND" | "INVALID" | "FAILED" | "NOT_LAWYER" | "MISSING_FIELDS" | "LOCKED" | "TOO_SOON";
export type WorkflowResult<T = undefined> = { ok: true; data: T } | { ok: false; code: Fail };
const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: Fail) => ({ ok: false as const, code });
const uuid = z.uuid();

/** Contrat visible par la personne (RLS) et, s'il a un dossier, accès au dossier vérifié d'abord. */
async function loadForStaff(id: string) {
  const role = await getSessionRole();
  if ((role !== "staff" && role !== "firm_admin") || !uuid.safeParse(id).success) return null;
  const loaded = await getContract(id);
  if (!loaded) return null;
  if (loaded.contract.matter && !(await assertStaffMatterAccess(loaded.contract.matter.id))) return null;
  return loaded;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof getContract>>>;

/** Données du PDF officiel, à partir du contrat tel qu'il est au moment de la validation. */
export async function pdfInputFor(loaded: Loaded, version: number, on: Date): Promise<PdfInput> {
  const lang = loaded.contract.language;
  const t = await getTranslations({ locale: lang, namespace: "admin.contracts" });
  const labels = Object.fromEntries(
    contractFieldKeys.map((k) => [k, t(`fieldKeys.${k.replace(".", "_")}`)]),
  ) as Record<ContractFieldKey, string>;
  const money = (v: string) => formatMoney(v, lang);
  const date = new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeZone: "America/Halifax",
  }).format(on);
  return {
    language: lang,
    title: loaded.contract.title,
    sections: loaded.sections.map((s) => ({ title: s.title, body: s.body })),
    values: loaded.values,
    labels,
    annex:
      loaded.lines.length && loaded.totals
        ? {
            title: t("annex"),
            cols: {
              description: t("annexCols.description"),
              quantity: t("annexCols.quantity"),
              unit: t("annexCols.unit"),
              total: t("annexCols.total"),
              subtotal: t("annexCols.subtotal"),
            },
            lines: loaded.lines.map((l) => ({
              description: l.description,
              quantity: formatDecimal(l.quantity, lang),
              unit: money(l.unit_price),
              total: money(fromCents(lineTotal(l.quantity, l.unit_price))),
            })),
            subtotal: money(loaded.totals.subtotal),
            taxes: loaded.totals.taxes.map((tx) => ({
              label: `${t(`services.tax.${tx.code}`)} (${formatDecimal(tx.rate, lang)} %)`,
              amount: money(tx.amount),
            })),
            total: money(loaded.totals.total),
          }
        : null,
    footer: t("pdf.footer", { version, date }),
    pageLabel: (page, pages) => t("pdf.page", { page, pages }),
    demo: loaded.contract.isMock ? t("demoFooter") : null,
  };
}

/** Validation par un avocat de l'équipe : aucun champ vide, PDF officiel, empreinte calculée par la base. */
export async function validateContract(id: string): Promise<WorkflowResult<string>> {
  const loaded = await loadForStaff(id);
  if (!loaded) return fail("NOT_FOUND");
  if (!loaded.contract.isLawyer) return fail("NOT_LAWYER");
  if (loaded.missing.length) return fail("MISSING_FIELDS");
  // 10 validations par personne et par 10 minutes (chaque validation stocke un PDF).
  const user = await getUser();
  if (!user || !(await hitRateLimit(`contract-validate:${user.id}`, { max: 10, windowSeconds: 600 })))
    return fail("TOO_SOON");
  const version = (loaded.versions[0]?.version ?? 0) + 1;
  const pdf = await renderContractPdf(await pdfInputFor(loaded, version, new Date()));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_validate", {
    p_contract: id,
    p_pdf_base64: pdf.toString("base64"),
  });
  if (error || !data) {
    if (error?.message.includes("lawyer only")) return fail("NOT_LAWYER");
    return fail(error?.code === "42501" ? "LOCKED" : "FAILED");
  }
  return ok(data);
}

export async function reopenContract(id: string): Promise<WorkflowResult> {
  if (!(await loadForStaff(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_reopen", { p_contract: id });
  return error ? fail(error.code === "P0002" ? "NOT_FOUND" : "FAILED") : ok(undefined);
}

/** Relance du client (une par jour au plus, revérifié par la base) : nouvel avis dans le portail et par e-mail. */
export async function remindContract(id: string): Promise<WorkflowResult> {
  if (!(await loadForStaff(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_remind", { p_contract: id });
  if (error)
    return fail(error.code === "55000" ? "TOO_SOON" : error.code === "P0002" ? "NOT_FOUND" : "FAILED");
  await notifyContractSent(id, { reminder: true });
  return ok(undefined);
}

/** Nouvelle version après l'envoi ou un refus : un brouillon qui reprend tout ; l'ancien est remplacé. */
export async function newContractVersion(id: string): Promise<WorkflowResult<string>> {
  if (!(await loadForStaff(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_new_version", { p_contract: id });
  return error || !data ? fail(error?.code === "P0002" ? "NOT_FOUND" : "FAILED") : ok(data);
}

/** Contrat accepté sans dossier : le firm_admin le rattache à un dossier, puis ouvre le dossier. */
export async function linkContractMatter(id: string, matterId: string): Promise<WorkflowResult> {
  if ((await getSessionRole()) !== "firm_admin" || !uuid.safeParse(matterId).success)
    return fail("NOT_FOUND");
  if (!(await loadForStaff(id)) || !(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_link_matter", { p_contract: id, p_matter: matterId });
  return error ? fail(error.code === "P0002" ? "NOT_FOUND" : "FAILED") : ok(undefined);
}

// ---------------------------------------------------------------------------------------------
// Commentaires de relecture (par section)
// ---------------------------------------------------------------------------------------------
export type ContractComment = {
  id: string;
  sectionId: string | null;
  body: string;
  author: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function listComments(contractId: string): Promise<ContractComment[]> {
  if (!uuid.safeParse(contractId).success) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contract_comments")
    .select("id, section_id, body, created_by, created_at, resolved_at")
    .eq("contract_id", contractId)
    .order("created_at")
    .limit(300);
  const ids = [...new Set((data ?? []).map((c) => c.created_by).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", ids)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const names = new Map(
    (people ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null]),
  );
  return (data ?? []).map((c) => ({
    id: c.id,
    sectionId: c.section_id,
    body: c.body,
    author: c.created_by ? (names.get(c.created_by) ?? null) : null,
    createdAt: c.created_at,
    resolvedAt: c.resolved_at,
  }));
}

export const commentSchema = z.object({
  sectionId: z.uuid().nullable(),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().min(1).max(2000))
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),
});

export async function addComment(contractId: string, input: unknown): Promise<WorkflowResult> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID");
  const user = await getUser();
  if (!user || !(await loadForStaff(contractId))) return fail("NOT_FOUND");
  // 60 commentaires par personne et par 10 minutes.
  if (!(await hitRateLimit(`contract-comment:${user.id}`, { max: 60, windowSeconds: 600 })))
    return fail("TOO_SOON");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("contract_comments").insert({
    contract_id: contractId,
    section_id: parsed.data.sectionId,
    body: parsed.data.body,
    created_by: user.id,
  });
  return error ? fail("FAILED") : ok(undefined);
}

export async function resolveComment(
  contractId: string,
  commentId: string,
  resolved: boolean,
): Promise<WorkflowResult> {
  if (!uuid.safeParse(commentId).success || !(await loadForStaff(contractId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contract_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", commentId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return fail("FAILED");
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

// ---------------------------------------------------------------------------------------------
// PDF officiel (téléchargement)
// ---------------------------------------------------------------------------------------------
/** Le PDF officiel, pour l'équipe ou le client destinataire (la base décide et journalise). */
export async function readContractPdf(contractId: string) {
  if (!uuid.safeParse(contractId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("contract_pdf", { p_contract: contractId });
  const row = (data ?? [])[0];
  if (!row?.pdf_base64) return null;
  return { version: row.version, sha256: row.sha256, body: Buffer.from(row.pdf_base64, "base64") };
}

// ---------------------------------------------------------------------------------------------
// Copie Word (ADR 0039) : équipe seulement ; même contenu que le PDF officiel de la version validée.
// ---------------------------------------------------------------------------------------------
export async function readContractDocx(contractId: string) {
  const loaded = await loadForStaff(contractId);
  const c = loaded?.contract;
  if (!loaded || !c || !c.validatedVersion || !c.validatedAt) return null;
  // Le texte est figé depuis la validation (plus modifiable) : c'est celui de la version validée.
  const body = await renderContractDocx(
    await pdfInputFor(loaded, c.validatedVersion, new Date(c.validatedAt)),
  );
  const user = await getUser();
  await recordAudit({
    action: "contract.docx_downloaded",
    resourceType: "contract",
    resourceId: c.id,
    matterId: c.matter?.id ?? null,
    actorId: user?.id ?? null,
    metadata: { version: c.validatedVersion },
  });
  return { version: c.validatedVersion, body };
}
