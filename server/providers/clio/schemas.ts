import "server-only";
import { z } from "zod";

/**
 * Réponses de l'API Clio Manage v4 (région CA), validées par Zod (AGENTS.md §5).
 * Seules les ressources « Confirmé » de docs/clio-api-mapping.md sont utilisées :
 * matters, contacts, bills (lecture). Les noms de champs demandés (`fields=`) sont à
 * REVÉRIFIER sur le compte développeur du cabinet avant la mise en production (ADR 0014).
 * Un champ `redacted: true` (permissions insuffisantes) est traité comme ABSENT.
 */
const redactable = <T extends z.ZodType>(schema: T) =>
  z
    .union([schema, z.object({ redacted: z.literal(true) }).transform(() => undefined)])
    .optional()
    .nullable();

const named = z.object({ id: z.number().optional(), name: z.string().optional() }).passthrough();

export const clioMatterSchema = z
  .object({
    id: z.number(),
    display_number: redactable(z.string()),
    description: redactable(z.string()),
    status: redactable(z.enum(["Open", "Pending", "Closed"])),
    open_date: redactable(z.string()),
    close_date: redactable(z.string()),
    practice_area: redactable(named),
    responsible_attorney: redactable(named),
    client: redactable(named),
  })
  .passthrough();
export type ClioMatter = z.infer<typeof clioMatterSchema>;
export const MATTER_FIELDS =
  "id,display_number,description,status,open_date,close_date,practice_area{name},responsible_attorney{name},client{id,name}";

export const clioContactSchema = z
  .object({
    id: z.number(),
    name: redactable(z.string()),
    primary_email_address: redactable(z.string()),
    type: redactable(z.string()),
  })
  .passthrough();
export type ClioContact = z.infer<typeof clioContactSchema>;
export const CONTACT_FIELDS = "id,name,primary_email_address,type";

export const clioBillSchema = z
  .object({
    id: z.number(),
    number: redactable(z.string()),
    issued_at: redactable(z.string()),
    due_at: redactable(z.string()),
    total: redactable(z.number()),
    balance: redactable(z.number()),
    state: redactable(z.string()),
  })
  .passthrough();
export type ClioBill = z.infer<typeof clioBillSchema>;
export const BILL_FIELDS = "id,number,issued_at,due_at,total,balance,state";

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z
      .object({ paging: z.object({ next: z.string().url().optional() }).partial().optional() })
      .partial()
      .optional(),
  });

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

/** Jetons tels que conservés dans Supabase Vault (JSON chiffré). */
export const storedTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_at: z.number().int().optional(), // ms epoch
});
export type StoredTokens = z.infer<typeof storedTokensSchema>;
