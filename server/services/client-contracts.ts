import "server-only";
import { z } from "zod";
import { contractDocSchema, type ContractDoc } from "@/lib/contract-doc";
import { computeTotals } from "@/lib/money";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { fieldValues } from "@/server/services/contracts";

/**
 * Contrats côté client (ADR 0035). Le client ne lit jamais la table des contrats : seulement ses
 * contrats envoyés, dans la version figée à l'envoi, par public.client_contracts / client_contract
 * (session client avec double vérification exigée par la base). Même réponse « introuvable » pour un
 * contrat qui n'est pas le sien.
 */
export type ClientContractRow = {
  id: string;
  title: string;
  language: "fr" | "en";
  status: "sent" | "signed" | "declined";
  signing_mode: "clio" | "portal";
  sent_at: string;
  viewed_at: string | null;
  accepted_at: string | null;
};

export async function listMyContracts(): Promise<ClientContractRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("client_contracts");
  return (data ?? []) as unknown as ClientContractRow[];
}

const snapshotSchema = z.object({
  title: z.string(),
  client_name: z.string(),
  client_email: z.string().nullable().optional(),
  client_address: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  sections: z.array(z.object({ position: z.number(), title: z.string().nullable(), body: z.unknown() })),
});
const loadedSchema = z.object({
  id: z.uuid(),
  status: z.enum(["sent", "signed", "declined"]),
  signing_mode: z.enum(["clio", "portal"]),
  language: z.enum(["fr", "en"]),
  sent_at: z.string(),
  accepted_at: z.string().nullable(),
  accepted_name: z.string().nullable(),
  declined_at: z.string().nullable().optional(),
  decline_reason: z.string().nullable().optional(),
  pdf_sha256: z.string().nullable().optional(),
  snapshot: snapshotSchema,
  matter: z.object({ number: z.string().nullable(), title: z.string() }).nullable(),
  lawyer: z.string().nullable(),
  lines: z.array(
    z.object({
      description: z.string(),
      pricing: z.enum(["flat", "hourly"]),
      quantity: z.string(),
      unit_price: z.string(),
    }),
  ),
  rates: z.array(z.object({ tax_code: z.string(), rate: z.string() })),
});

export async function getMyContract(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("client_contract", { p_contract: id });
  const parsed = loadedSchema.safeParse(data);
  if (!parsed.success) return null;
  const c = parsed.data;
  // Le contenu est relu par la liste blanche (ADR 0032) avant tout rendu.
  const sections = c.snapshot.sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const body = contractDocSchema.safeParse(s.body);
      return {
        title: s.title,
        body: (body.success ? body.data : { type: "doc", content: [] }) as ContractDoc,
      };
    });
  const totals = c.lines.length ? computeTotals(c.lines, c.rates) : null;
  const values = fieldValues(
    {
      language: c.language,
      clientName: c.snapshot.client_name,
      clientEmail: c.snapshot.client_email ?? null,
      clientAddress: c.snapshot.client_address ?? null,
      clientPhone: c.snapshot.client_phone ?? null,
      matter: c.matter,
      author: c.lawyer,
    },
    totals,
    new Date(c.sent_at),
  );
  // Première consultation (une seule fois, journalisée par la base).
  await supabase.rpc("client_contract_viewed", { p_contract: id });
  return { ...c, title: c.snapshot.title, sections, totals, values };
}

export const acceptSchema = z.object({
  contractId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
  agree: z.literal("on"),
});

export async function acceptContract(input: z.infer<typeof acceptSchema>) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_contract_accept", {
    p_contract: input.contractId,
    p_name: input.name,
  });
  if (!error) return { ok: true as const };
  return { ok: false as const, code: error.code === "P0002" ? ("NOT_FOUND" as const) : ("FAILED" as const) };
}

export const declineSchema = z.object({
  contractId: z.uuid(),
  reason: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(500))
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),
});

/** Refus par le client (ADR 0036) : le motif est facultatif et n'est jamais journalisé. */
export async function declineContract(input: z.infer<typeof declineSchema>) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_contract_decline", {
    p_contract: input.contractId,
    p_reason: input.reason,
  });
  if (!error) return { ok: true as const };
  return { ok: false as const, code: error.code === "P0002" ? ("NOT_FOUND" as const) : ("FAILED" as const) };
}
