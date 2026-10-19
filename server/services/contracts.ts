import "server-only";
import { z } from "zod";
import type { Json } from "@/types/database";
import {
  contractDocSchema,
  contractStatuses,
  type ContractStatus,
  docToText,
  maskPersonalData,
  missingFields,
  type ContractDoc,
  type ContractFieldKey,
  type FieldValues,
} from "@/lib/contract-doc";
import { contractSkeleton } from "@/lib/contract-skeleton";
import { DEFAULT_TIMEZONE, formatMoney } from "@/lib/format";
import { computeTotals, type Totals } from "@/lib/money";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getAiGateway } from "@/server/providers";
import { AiError, aiAssistKinds, type AiAssistKind } from "@/server/providers/ai/gateway";
import { hitRateLimit } from "@/server/security/rate-limit";
import { recordAudit } from "@/server/services/audit";
import {
  copyTemplateContent,
  getTemplateVersion,
  listTaxRates,
  provinces,
  ratesFor,
  templateLineSchema,
  type Province,
} from "@/server/services/contract-library";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";

/**
 * Contrats, lot 1 (ADR 0032, stories F1 à F3). Toutes les lectures et écritures passent par la session
 * de l'utilisateur (RLS) : auteur, équipe du dossier lié ou firm_admin ; écriture du contenu seulement
 * en tenant le verrou (revérifié par la base). Un contrat lié à un dossier passe d'abord par
 * assertMatterAccess (AGENTS.md §2.4). Aucun service_role ici.
 */
export const FIRM_NAME = "Lex Canada Law";
export { contractStatuses, type ContractStatus };

const uuid = z.uuid();
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
export const contractHeaderSchema = z.object({
  title: singleLine(200).pipe(z.string().min(1)),
  language: z.enum(["fr", "en"]),
  clientName: singleLine(200).pipe(z.string().min(1)),
  clientEmail: z
    .union([z.literal(""), z.email().max(254)])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  // Retours à la ligne des formulaires (CRLF) ramenés à LF avant le contrôle des caractères.
  clientAddress: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(500))
    .refine((v) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v))
    .optional()
    .transform((v) => (v ? v : null)),
  clientPhone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+(). -]*$/)
    .optional()
    .transform((v) => (v ? v : null)),
  clientLanguage: z.enum(["fr", "en"]),
  clientProvince: z
    .union([z.literal(""), z.enum(provinces)])
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ContractHeader = z.infer<typeof contractHeaderSchema>;

export const newContractSchema = contractHeaderSchema.extend({
  templateId: z
    .union([z.literal(""), uuid])
    .optional()
    .transform((v) => v || null),
  matterId: z
    .union([z.literal(""), uuid])
    .optional()
    .transform((v) => v || null),
  clientId: z
    .union([z.literal(""), uuid])
    .optional()
    .transform((v) => v || null),
});

export const contractFiltersSchema = z.object({
  status: z.enum(["active", "all", ...contractStatuses]).catch("active"),
  q: singleLine(100).optional().catch(undefined),
  mine: z.enum(["1"]).optional().catch(undefined),
});

type Fail = "NOT_FOUND" | "LOCKED" | "INVALID" | "FAILED" | "RATE_LIMITED" | "UNAVAILABLE";
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; code: Fail };
const fail = (code: Fail) => ({ ok: false as const, code });
const ok = <T>(data: T) => ({ ok: true as const, data });
const dbFail = (code: string | undefined): Fail =>
  code === "55006"
    ? "LOCKED"
    : code === "23514" || code === "22023"
      ? "INVALID"
      : code === "P0002"
        ? "NOT_FOUND"
        : "FAILED";

async function staffUser() {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return null;
  const user = await getUser();
  return user ? { id: user.id, role } : null;
}

const LIST_COLUMNS =
  "id, title, language, status, matter_id, client_name, created_by, updated_at, created_at, is_mock, matters(display_number, title)";

/** Liste (F1) : contrats visibles (RLS), filtres simples. */
export async function listContracts(filters: z.infer<typeof contractFiltersSchema>, matterId?: string) {
  const user = await staffUser();
  if (!user) return null;
  if (matterId) await assertStaffMatterAccess(matterId);
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("contracts")
    .select(LIST_COLUMNS)
    .eq("template_draft", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.status === "active") query = query.not("status", "in", "(cancelled,superseded)");
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.mine) query = query.eq("created_by", user.id);
  if (matterId) query = query.eq("matter_id", matterId);
  if (filters.q) {
    const q = filters.q.replace(/[%,()*\\"_]/g, " ").trim();
    if (q) query = query.or(`client_name.ilike.%${q}%,title.ilike.%${q}%`);
  }
  const { data } = await query;
  const rows = data ?? [];
  const authors = await namesOf([...new Set(rows.map((r) => r.created_by))]);
  return rows.map((r) => {
    const matter = r.matters as unknown as { display_number: string | null; title: string } | null;
    return {
      id: r.id,
      title: r.title,
      language: r.language as "fr" | "en",
      status: r.status as ContractStatus,
      matterId: r.matter_id,
      matterNumber: matter?.display_number ?? null,
      clientName: r.client_name,
      author: authors.get(r.created_by) ?? null,
      updatedAt: r.updated_at,
      isMock: r.is_mock,
    };
  });
}

/** Noms affichables du personnel (profils visibles sous RLS). */
async function namesOf(ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, title, first_name, last_name, email")
    .in("id", ids);
  for (const p of data ?? [])
    map.set(p.id, [p.title, p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  return map;
}

/** Clients que la personne peut choisir (profils visibles sous RLS : ses dossiers, tous pour le firm_admin). */
export async function listClientChoices() {
  if (!(await staffUser())) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, phone, preferred_language")
    .eq("role", "client")
    .order("last_name")
    .limit(300);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
    email: p.email,
    phone: p.phone,
    language: p.preferred_language as "fr" | "en",
  }));
}

/** Dossiers auxquels on peut lier un contrat (équipe, ou tous pour le firm_admin). */
export async function listMatterChoices() {
  const user = await staffUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matters")
    .select("id, display_number, title")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (user.role !== "firm_admin") {
    const { data: team } = await supabase.from("matter_team").select("matter_id").eq("user_id", user.id);
    const ids = (team ?? []).map((t) => t.matter_id);
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const { data } = await query;
  return data ?? [];
}

/** Création (F2) : en-tête, fiche du client (copie), squelette de sections. Renvoie l'identifiant. */
export async function createContract(input: z.infer<typeof newContractSchema>): Promise<Result<string>> {
  const user = await staffUser();
  if (!user) return fail("NOT_FOUND");
  if (input.matterId) await assertStaffMatterAccess(input.matterId);
  const template = input.templateId ? await getTemplateVersion(input.templateId) : null;
  if (input.templateId && (!template || template.template.status !== "published")) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      title: input.title,
      // Un contrat issu d'un modèle est dans la langue du modèle.
      language: template ? (template.template.language as "fr" | "en") : input.language,
      template_id: template?.template.id ?? null,
      template_version: template?.version ?? null,
      client_province: input.clientProvince,
      matter_id: input.matterId,
      client_id: input.clientId,
      client_name: input.clientName,
      client_email: input.clientEmail,
      client_address: input.clientAddress,
      client_phone: input.clientPhone,
      client_language: input.clientLanguage,
    })
    .select("id")
    .single();
  if (error || !data) return fail(dbFail(error?.code));
  if (template) {
    const copied = await copyTemplateContent(data.id, template.sections, template.lines);
    return copied ? ok(data.id) : fail("FAILED");
  }
  // L'auteur tient le verrou depuis la création : il pose les sections de départ.
  const { error: sectionsError } = await supabase.from("contract_sections").insert(
    contractSkeleton(input.language).map((s, position) => ({
      contract_id: data.id,
      position,
      title: s.title,
      body: s.body as unknown as NonNullable<Json>,
    })),
  );
  if (sectionsError) return fail("FAILED");
  return ok(data.id);
}

export type EditorSection = {
  id: string;
  position: number;
  title: string;
  body: ContractDoc;
  aiAssisted: boolean;
};

/** Contrat complet pour l'éditeur et l'aperçu ; null si invisible (même réponse que « n'existe pas »). */
export async function getContract(id: string) {
  const user = await staffUser();
  if (!user || !uuid.safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase
    .from("contracts")
    .select(
      "id, title, language, status, matter_id, client_id, client_name, client_email, client_address, client_phone, client_language, client_province, template_id, template_version, template_draft, created_by, locked_by, locked_until, is_mock, cancel_reason, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  if (c.matter_id) await assertStaffMatterAccess(c.matter_id);
  const [{ data: sections }, { data: versions }, { data: matter }] = await Promise.all([
    supabase
      .from("contract_sections")
      .select("id, position, title, body, ai_assisted")
      .eq("contract_id", id)
      .order("position")
      .order("created_at"),
    supabase
      .from("contract_versions")
      .select("version, label, created_by, created_at")
      .eq("contract_id", id)
      .order("version", { ascending: false })
      .limit(50),
    c.matter_id
      ? supabase.from("matters").select("id, display_number, title").eq("id", c.matter_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const names = await namesOf(
    [c.created_by, c.locked_by, ...(versions ?? []).map((v) => v.created_by)].filter((x): x is string =>
      Boolean(x),
    ),
  );
  const editorSections: EditorSection[] = (sections ?? []).map((s) => {
    const parsed = contractDocSchema.safeParse(s.body);
    return {
      id: s.id,
      position: s.position,
      title: s.title,
      body: parsed.success ? (parsed.data as ContractDoc) : { type: "doc", content: [] },
      aiAssisted: s.ai_assisted,
    };
  });
  const lockedByOther =
    c.locked_by && c.locked_by !== user.id && c.locked_until && Date.parse(c.locked_until) > Date.now()
      ? { name: names.get(c.locked_by) ?? null, until: c.locked_until }
      : null;
  const contract = {
    id: c.id,
    title: c.title,
    language: c.language as "fr" | "en",
    status: c.status as ContractStatus,
    matter: matter ? { id: matter.id, number: matter.display_number, title: matter.title } : null,
    clientId: c.client_id,
    clientName: c.client_name,
    clientEmail: c.client_email,
    clientAddress: c.client_address,
    clientPhone: c.client_phone,
    clientLanguage: c.client_language as "fr" | "en",
    author: names.get(c.created_by) ?? null,
    isMock: c.is_mock,
    cancelReason: c.cancel_reason,
    updatedAt: c.updated_at,
    editable: c.status === "draft" || c.status === "in_review",
    clientProvince: (c.client_province as Province | null) ?? null,
    templateId: c.template_id,
    templateVersion: c.template_version,
    templateDraft: c.template_draft,
  };
  const [{ data: lineRows }, taxRates] = await Promise.all([
    supabase
      .from("contract_line_items")
      .select("id, position, service_id, description, pricing, quantity::text, unit_price::text")
      .eq("contract_id", id)
      .order("position")
      .order("created_at"),
    listTaxRates(),
  ]);
  const lines = (lineRows ?? []) as unknown as ContractLine[];
  // Taux en vigueur à la date du contrat : un changement de taux ne modifie pas un contrat déjà rédigé.
  const contractDay = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE }).format(
    new Date(c.created_at),
  );
  const rates = ratesFor(taxRates, contract.clientProvince, contractDay);
  const totals = lines.length ? computeTotals(lines, rates) : null;
  const values = fieldValues(contract, totals);
  return {
    contract,
    sections: editorSections,
    versions: (versions ?? []).map((v) => ({
      version: v.version,
      label: v.label,
      author: v.created_by ? (names.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    })),
    lockedByOther,
    lines,
    totals,
    taxesToVerify: rates.some((r) => r.needs_verification),
    rates: rates.map((r) => ({ tax_code: r.tax_code, rate: r.rate })),
    values,
    missing: missingFields(
      editorSections.map((s) => s.body),
      values,
    ),
  };
}

/** Valeurs des champs (F3) : fiche du client copiée dans le contrat, dossier, auteur, cabinet, date. */
export function fieldValues(
  c: {
    language: "fr" | "en";
    clientName: string;
    clientEmail: string | null;
    clientAddress: string | null;
    clientPhone: string | null;
    matter: { number: string | null; title: string } | null;
    author: string | null;
  },
  totals: Totals | null = null,
): FieldValues {
  const money = (v: string) => formatMoney(v, c.language);
  return {
    "fees.subtotal": totals ? money(totals.subtotal) : null,
    "fees.taxes": totals ? money(totals.taxTotal) : null,
    "fees.total": totals ? money(totals.total) : null,
    "client.name": c.clientName,
    "client.email": c.clientEmail,
    // Dans le texte du contrat, l'adresse tient sur une ligne (décision du 2026-10-18) ; la fiche garde les lignes.
    "client.address": c.clientAddress
      ? c.clientAddress
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .join(", ")
      : null,
    "client.phone": c.clientPhone,
    "matter.number": c.matter?.number ?? null,
    "matter.title": c.matter?.title ?? null,
    "lawyer.name": c.author,
    "firm.name": FIRM_NAME,
    "date.today": new Intl.DateTimeFormat(c.language === "fr" ? "fr-CA" : "en-CA", {
      dateStyle: "long",
      timeZone: DEFAULT_TIMEZONE,
    }).format(new Date()),
  };
}

// ---------------------------------------------------------------------------------------------
// Écriture (verrou exigé par la base)
// ---------------------------------------------------------------------------------------------
/**
 * Avant toute écriture : le contrat doit être visible (RLS) et, s'il est lié à un dossier, l'accès au
 * dossier est vérifié d'abord (assertMatterAccess, AGENTS.md §2.4). Invisible : « introuvable ».
 */
async function writable(id: string): Promise<boolean> {
  if (!(await staffUser()) || !uuid.safeParse(id).success) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("contracts").select("matter_id").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.matter_id) await assertStaffMatterAccess(data.matter_id);
  return true;
}

export async function acquireLock(id: string) {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_acquire_lock", { p_contract: id });
  if (error) return fail(dbFail(error.code));
  const row = data?.[0];
  return ok({
    acquired: Boolean(row?.acquired),
    holderName: row?.holder_name ?? null,
    until: row?.until ?? null,
  });
}

export async function releaseLock(id: string) {
  if (!(await staffUser()) || !uuid.safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("contract_release_lock", { p_contract: id });
}

export async function updateHeader(id: string, header: ContractHeader): Promise<Result> {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({
      title: header.title,
      language: header.language,
      client_name: header.clientName,
      client_email: header.clientEmail,
      client_address: header.clientAddress,
      client_phone: header.clientPhone,
      client_language: header.clientLanguage,
      client_province: header.clientProvince,
    })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

export const sectionInputSchema = z.object({
  title: singleLine(200),
  body: contractDocSchema,
  aiAssisted: z.boolean().optional(),
});

/** Enregistrement automatique d'une section (contenu validé en liste blanche). */
export async function saveSection(contractId: string, sectionId: string, input: unknown): Promise<Result> {
  if (!uuid.safeParse(sectionId).success || !(await writable(contractId))) return fail("NOT_FOUND");
  // Le contenu arrive en texte JSON (taille bornée avant la lecture), puis passe la liste blanche.
  const raw = input as { title?: unknown; body?: unknown; aiAssisted?: unknown } | null;
  if (!raw || typeof raw.body !== "string" || raw.body.length > 180_000) return fail("INVALID");
  let body: unknown;
  try {
    body = JSON.parse(raw.body);
  } catch {
    return fail("INVALID");
  }
  const parsed = sectionInputSchema.safeParse({ title: raw.title, body, aiAssisted: raw.aiAssisted });
  if (!parsed.success) return fail("INVALID");
  if (JSON.stringify(parsed.data.body).length > 180_000) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const update: { title: string; body: ContractDoc; ai_assisted?: boolean } = {
    title: parsed.data.title,
    body: parsed.data.body as ContractDoc,
  };
  if (parsed.data.aiAssisted) update.ai_assisted = true;
  const { data, error } = await supabase
    .from("contract_sections")
    .update(update as never)
    .eq("id", sectionId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return fail(dbFail(error.code));
  // Aucune ligne : le verrou n'est plus tenu (RLS) ou la section n'existe plus.
  return data?.length ? ok(undefined) : fail("LOCKED");
}

export async function addSection(contractId: string, afterPosition: number, title: string): Promise<Result> {
  if (!(await writable(contractId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("contract_sections")
    .select("id, position")
    .eq("contract_id", contractId)
    .gt("position", afterPosition)
    .order("position", { ascending: false });
  // Décaler les sections suivantes (de la dernière à la première).
  for (const r of rows ?? []) {
    const { error } = await supabase
      .from("contract_sections")
      .update({ position: r.position + 1 })
      .eq("id", r.id);
    if (error) return fail(dbFail(error.code));
  }
  const { error } = await supabase.from("contract_sections").insert({
    contract_id: contractId,
    position: Math.min(afterPosition + 1, 199),
    title,
    body: { type: "doc", content: [] },
  });
  return error ? fail(dbFail(error.code)) : ok(undefined);
}

export async function removeSection(contractId: string, sectionId: string): Promise<Result> {
  if (!uuid.safeParse(sectionId).success || !(await writable(contractId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contract_sections")
    .delete()
    .eq("id", sectionId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("LOCKED");
}

export async function moveSection(
  contractId: string,
  sectionId: string,
  direction: "up" | "down",
): Promise<Result> {
  if (!uuid.safeParse(sectionId).success || !(await writable(contractId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contract_sections")
    .select("id, position")
    .eq("contract_id", contractId)
    .order("position")
    .order("created_at");
  const list = data ?? [];
  const i = list.findIndex((s) => s.id === sectionId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok(undefined);
  // Renumérotation complète 0..n-1 avec l'échange : positions toujours distinctes.
  const order = list.map((s) => s.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [position, id] of order.entries()) {
    const { error } = await supabase.from("contract_sections").update({ position }).eq("id", id);
    if (error) return fail(dbFail(error.code));
  }
  return ok(undefined);
}

export async function saveVersion(id: string, label: string | null): Promise<Result<number>> {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_save_version", {
    p_contract: id,
    p_label: label ?? (null as unknown as string),
  });
  return error ? fail(dbFail(error.code === "42501" ? "55006" : error.code)) : ok(data);
}

export async function restoreVersion(id: string, version: number): Promise<Result> {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_restore_version", { p_contract: id, p_version: version });
  return error ? fail(dbFail(error.code === "42501" ? "55006" : error.code)) : ok(undefined);
}

export async function setReviewStatus(id: string, status: "draft" | "in_review"): Promise<Result> {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("contracts").update({ status }).eq("id", id).select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

export async function cancelContract(id: string, reason: string): Promise<Result> {
  if (!(await writable(id))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbFail(error.code));
  return data?.length ? ok(undefined) : fail("NOT_FOUND");
}

// ---------------------------------------------------------------------------------------------
// Assistant de rédaction (simulateur au lot 1 ; OpenAI au lot 5)
// ---------------------------------------------------------------------------------------------
/** Règle de débit : 30 demandes par personne et par 10 minutes (coût quand OpenAI sera branché). */
const AI_RULE = { max: 30, windowSeconds: 10 * 60 };

export const aiAssistSchema = z.object({
  contractId: uuid,
  sectionId: uuid,
  kind: z.enum(aiAssistKinds),
  instruction: z.string().trim().max(1000).default(""),
});

/**
 * Proposition de l'IA pour une section : texte masqué (aucune coordonnée du client), proposition
 * renvoyée à l'éditeur ; rien n'est écrit sans que l'avocat l'accepte. Journal sans contenu.
 */
export async function aiAssist(
  input: z.infer<typeof aiAssistSchema>,
): Promise<Result<{ text: string; mock: boolean }>> {
  const user = await staffUser();
  if (!user) return fail("NOT_FOUND");
  if (!(await hitRateLimit(`contract_ai:user:${user.id}`, AI_RULE))) return fail("RATE_LIMITED");
  const loaded = await getContract(input.contractId);
  const section = loaded?.sections.find((s) => s.id === input.sectionId);
  if (!loaded || !section) return fail("NOT_FOUND");
  if (!loaded.contract.editable) return fail("INVALID");
  const c = loaded.contract;
  const party = { name: c.clientName, email: c.clientEmail, address: c.clientAddress, phone: c.clientPhone };
  const text = maskPersonalData(
    docToText(section.body, (key: ContractFieldKey) => `[${key}]`),
    party,
  );
  try {
    const gateway = getAiGateway();
    const proposal = await gateway.assist({
      kind: input.kind as AiAssistKind,
      language: c.language,
      sectionTitle: maskPersonalData(section.title, party),
      text: text.slice(0, 20_000),
      instruction: maskPersonalData(input.instruction, party),
    });
    await recordAudit({
      action: "contract.ai_assisted",
      resourceType: "contract",
      resourceId: c.id,
      matterId: c.matter?.id ?? null,
      actorId: user.id,
      metadata: { kind: input.kind, mock: gateway.isMock },
    });
    return ok({ text: proposal.slice(0, 20_000), mock: gateway.isMock });
  } catch (error) {
    const code = error instanceof AiError ? error.code : "UNAVAILABLE";
    console.error(JSON.stringify({ event: "contract_ai_failed", code }));
    return fail(code === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE");
  }
}

/** Nouveau client : le courriel appartient-il déjà à un client ? (personnel seulement ; oui ou non). */
export async function clientEmailKnown(email: string): Promise<boolean> {
  if (!(await staffUser())) return false;
  const parsed = z.email().max(254).safeParse(email.trim());
  if (!parsed.success) return false;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contract_client_email_known", { p_email: parsed.data });
  return !error && Boolean(data);
}

export type ContractLine = {
  id: string;
  position: number;
  service_id: string | null;
  description: string;
  pricing: "flat" | "hourly";
  quantity: string;
  unit_price: string;
};

export const linesInputSchema = z.array(templateLineSchema).max(100);

/**
 * Tableau des services (F6) : remplacé en entier, en une transaction (`contract_replace_lines`, verrou exigé
 * par la base ; en cas d'erreur, l'ancien tableau reste).
 * Montants en chaînes décimales exactes, jamais en nombre flottant.
 */
export async function saveLines(contractId: string, input: unknown): Promise<Result> {
  if (!(await writable(contractId))) return fail("NOT_FOUND");
  const parsed = linesInputSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_replace_lines", {
    p_contract: contractId,
    p_lines: parsed.data.map((l) => ({
      description: l.description,
      pricing: l.pricing,
      quantity: l.quantity,
      unit_price: l.unit_price,
      service_id: l.service_id ?? null,
    })),
  });
  return error ? fail(dbFail(error.code)) : ok(undefined);
}
