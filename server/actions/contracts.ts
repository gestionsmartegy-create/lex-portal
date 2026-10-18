"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit } from "@/server/security/rate-limit";
import {
  acquireLock,
  addSection,
  aiAssist,
  aiAssistSchema,
  cancelContract,
  clientEmailKnown,
  contractHeaderSchema,
  createContract,
  moveSection,
  newContractSchema,
  releaseLock,
  removeSection,
  restoreVersion,
  saveSection,
  saveVersion,
  setReviewStatus,
  updateHeader,
} from "@/server/services/contracts";
import { localeSchema } from "@/server/validation/auth";

/**
 * Contrats, lot 1 (ADR 0032). Chaque action revérifie la session et le rôle (requireStaff) et valide son
 * entrée avec Zod ; le service lit et écrit sous la session (RLS) et la base exige le verrou.
 * Les identifiants reçus ne sont jamais crus : la base refuse ce qui n'est pas visible ou modifiable.
 */
const id = z.uuid();
type Outcome = { ok: true } | { ok: false; code: string };
const done = (r: { ok: boolean; code?: string }): Outcome =>
  r.ok ? { ok: true } : { ok: false, code: r.code ?? "FAILED" };

/** Création (formulaire « Nouveau contrat »), puis ouverture de l'éditeur. */
export async function createContractAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale);
  const parsed = newContractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  const r = await createContract(parsed.data);
  if (!r.ok) return { error: r.code };
  redirect(`/${locale}/admin/contracts/${r.data}`);
}

export async function acquireLockAction(locale: string, contractId: string) {
  await requireStaff(localeSchema.catch("en").parse(locale));
  if (!id.safeParse(contractId).success) return { ok: false as const, code: "NOT_FOUND" };
  return acquireLock(contractId);
}

export async function releaseLockAction(locale: string, contractId: string): Promise<void> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  if (id.safeParse(contractId).success) await releaseLock(contractId);
}

export async function saveSectionAction(
  locale: string,
  contractId: string,
  sectionId: string,
  input: unknown,
): Promise<Outcome> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  return done(await saveSection(contractId, sectionId, input));
}

export async function updateHeaderAction(
  locale: string,
  contractId: string,
  input: unknown,
): Promise<Outcome> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  const parsed = contractHeaderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  return done(await updateHeader(contractId, parsed.data));
}

const sectionOp = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    after: z.number().int().min(-1).max(198),
    title: z.string().trim().max(200),
  }),
  z.object({ op: z.literal("remove"), sectionId: id }),
  z.object({ op: z.literal("move"), sectionId: id, direction: z.enum(["up", "down"]) }),
]);

export async function sectionOpAction(locale: string, contractId: string, input: unknown): Promise<Outcome> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  const parsed = sectionOp.safeParse(input);
  if (!parsed.success || !id.safeParse(contractId).success) return { ok: false, code: "INVALID" };
  const op = parsed.data;
  if (op.op === "add") return done(await addSection(contractId, op.after, op.title));
  if (op.op === "remove") return done(await removeSection(contractId, op.sectionId));
  return done(await moveSection(contractId, op.sectionId, op.direction));
}

const versionOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), label: z.string().trim().max(120).optional() }),
  z.object({ op: z.literal("restore"), version: z.number().int().min(1).max(100_000) }),
]);

export async function versionAction(locale: string, contractId: string, input: unknown): Promise<Outcome> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  const parsed = versionOp.safeParse(input);
  if (!parsed.success || !id.safeParse(contractId).success) return { ok: false, code: "INVALID" };
  if (parsed.data.op === "save") return done(await saveVersion(contractId, parsed.data.label || null));
  return done(await restoreVersion(contractId, parsed.data.version));
}

const statusOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("review"), status: z.enum(["draft", "in_review"]) }),
  z.object({ op: z.literal("cancel"), reason: z.string().trim().min(1).max(500) }),
]);

export async function statusAction(locale: string, contractId: string, input: unknown): Promise<Outcome> {
  await requireStaff(localeSchema.catch("en").parse(locale));
  const parsed = statusOp.safeParse(input);
  if (!parsed.success || !id.safeParse(contractId).success) return { ok: false, code: "INVALID" };
  if (parsed.data.op === "review") return done(await setReviewStatus(contractId, parsed.data.status));
  return done(await cancelContract(contractId, parsed.data.reason));
}

/** Proposition de l'IA (simulateur au lot 1) : texte masqué, rien n'est écrit sans acceptation. */
export async function aiAssistAction(locale: string, input: unknown) {
  await requireStaff(localeSchema.catch("en").parse(locale));
  const parsed = aiAssistSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID" };
  return aiAssist(parsed.data);
}

/** Détection de doublon à la saisie d'un nouveau client (limitée : 60 par 10 minutes). */
export async function checkClientEmailAction(locale: string, email: string): Promise<boolean> {
  const { profile } = await requireStaff(localeSchema.catch("en").parse(locale));
  if (typeof email !== "string" || email.length > 254) return false;
  if (!(await hitRateLimit(`contract_email:user:${profile.id}`, { max: 60, windowSeconds: 600 })))
    return false;
  return clientEmailKnown(email);
}
