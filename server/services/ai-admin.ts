import "server-only";
import { z } from "zod";
import type { Json } from "@/types/database";
import { contractDocSchema, maskPersonalData, textToDoc } from "@/lib/contract-doc";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getAiGateway } from "@/server/providers";
import { hitRateLimit } from "@/server/security/rate-limit";
import { AiError } from "@/server/providers/ai/gateway";
import { contractDomains } from "@/server/services/contract-library";

/**
 * Assistant IA, administration (ADR 0037, F13 et F14). Réglages et consommation : firm_admin ; la base
 * revérifie le rôle (RLS, fonctions). Jamais de texte envoyé ni de réponse dans un journal.
 */
const isAdmin = async () => (await getSessionRole()) === "firm_admin";

export type AiSettings = { enabled: boolean; monthlyCapCents: number; centsPer1kChars: string };
export type AiUsage = { requests: number; costCents: string; capCents: number };

export async function getAiSettings(): Promise<AiSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ai_settings")
    .select("enabled, monthly_cap_cents, cents_per_1k_chars::text")
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as { enabled: boolean; monthly_cap_cents: number; cents_per_1k_chars: string };
  return {
    enabled: row.enabled,
    monthlyCapCents: row.monthly_cap_cents,
    centsPer1kChars: row.cents_per_1k_chars,
  };
}

export async function getAiMonthUsage(): Promise<AiUsage | null> {
  if (!(await isAdmin())) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("ai_month_usage");
  const row = (data ?? [])[0] as unknown as
    { requests: number; cost_cents: string | number; cap_cents: number } | undefined;
  return row ? { requests: row.requests, costCents: String(row.cost_cents), capCents: row.cap_cents } : null;
}

export const aiSettingsSchema = z.object({
  enabled: z.enum(["on"]).optional(),
  // Plafond saisi en dollars (« 50 » ou « 50.00 »), converti en cents entiers sans nombre flottant.
  monthlyCap: z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/)
    .transform((v) => {
      const [whole, frac = ""] = v.split(".");
      return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
    })
    // Même borne que la base (100 000 $), pour un message clair plutôt qu'un échec.
    .refine((cents) => cents <= 10_000_000),
  centsPer1kChars: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,4})?$/),
});

export async function saveAiSettings(input: z.infer<typeof aiSettingsSchema>) {
  if (!(await isAdmin())) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_settings")
    .update({
      enabled: input.enabled === "on",
      monthly_cap_cents: input.monthlyCap,
      cents_per_1k_chars: input.centsPer1kChars as unknown as number,
    })
    .eq("id", true)
    .select("enabled");
  return { ok: !error && Boolean(data?.length) };
}

export const aiTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
  domain: z.enum(contractDomains),
  language: z.enum(["fr", "en"]),
  description: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().min(10).max(2000)),
});

/**
 * Gabarit proposé par l'IA (F13) : la description est masquée (données personnelles retirées), le
 * gabarit est créé en BROUILLON « à faire valider » ; le firm_admin le relit puis le publie.
 */
export async function generateAiTemplate(
  input: z.infer<typeof aiTemplateSchema>,
): Promise<
  { ok: true; id: string } | { ok: false; code: "FORBIDDEN" | "BUDGET_EXCEEDED" | "DISABLED" | "FAILED" }
> {
  if (!(await isAdmin())) return { ok: false, code: "FORBIDDEN" };
  // 10 gabarits par personne et par heure (chaque demande est facturée une fois OpenAI branché).
  const user = await getUser();
  if (!user || !(await hitRateLimit(`ai_template:user:${user.id}`, { max: 10, windowSeconds: 3600 })))
    return { ok: false, code: "FAILED" };
  const supabase = await createSupabaseServerClient();
  const description = maskPersonalData(input.description.slice(0, 2000), {});
  const gateway = getAiGateway();
  const { data: usageId, error: reserveError } = await supabase.rpc("ai_reserve", {
    p_contract: null as unknown as string,
    p_kind: "template",
    p_chars_in: description.length,
    p_mock: gateway.isMock,
  });
  if (reserveError || !usageId)
    return {
      ok: false,
      code:
        reserveError?.code === "54000"
          ? "BUDGET_EXCEEDED"
          : reserveError?.code === "55000"
            ? "DISABLED"
            : "FAILED",
    };
  try {
    const proposal = await gateway.generateTemplate({
      language: input.language,
      domain: input.domain,
      description,
    });
    const sections = proposal.sections.slice(0, 60).map((s, position) => {
      const body = contractDocSchema.parse(textToDoc(s.text.slice(0, 20_000)));
      return { position, title: s.title.slice(0, 200), body, ai_assisted: true };
    });
    if (!sections.length) throw new AiError("UPSTREAM");
    const { data: id, error } = await supabase.rpc("contract_template_create_draft", {
      p_name: input.name,
      p_domain: input.domain,
      p_language: input.language,
      p_sections: sections as unknown as Json,
    });
    const chars = proposal.sections.reduce((n, s) => n + s.title.length + s.text.length, 0);
    await supabase.rpc("ai_complete", { p_usage: usageId, p_chars_out: chars, p_ok: !error });
    return error || !id ? { ok: false, code: "FAILED" } : { ok: true, id };
  } catch {
    await supabase.rpc("ai_complete", { p_usage: usageId, p_chars_out: 0, p_ok: false });
    console.error(JSON.stringify({ event: "ai_template_failed" }));
    return { ok: false, code: "FAILED" };
  }
}
