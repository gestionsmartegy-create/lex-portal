"use server";

import "server-only";
import { redirect } from "next/navigation";
import { requireClientSession } from "@/server/auth/session";
import {
  acceptContract,
  acceptSchema,
  declineContract,
  declineSchema,
} from "@/server/services/client-contracts";
import { localeSchema } from "@/server/validation/auth";

/**
 * Acceptation d'un contrat dans le portail (ADR 0035) : session CLIENT exigée, entrée validée par Zod,
 * la base revérifie que le contrat est le sien, envoyé, en mode « portail », et journalise.
 */
export async function acceptContractAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireClientSession(locale);
  const parsed = acceptSchema.safeParse({
    contractId: formData.get("contractId"),
    name: formData.get("name"),
    agree: formData.get("agree"),
  });
  const id = typeof formData.get("contractId") === "string" ? String(formData.get("contractId")) : "";
  const back = /^[0-9a-f-]{36}$/.test(id)
    ? `/${locale}/portal/contracts/${id}`
    : `/${locale}/portal/contracts`;
  if (!parsed.success) redirect(`${back}?notice=invalid`);
  const r = await acceptContract(parsed.data);
  if (!r.ok) redirect(r.code === "NOT_FOUND" ? `/${locale}/portal/contracts` : `${back}?notice=failed`);
  redirect(`${back}?notice=accepted`);
}

/** Refus d'un contrat par le client (ADR 0036) : session CLIENT, Zod, la base revérifie tout. */
export async function declineContractAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireClientSession(locale);
  const parsed = declineSchema.safeParse({
    contractId: formData.get("contractId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) redirect(`/${locale}/portal/contracts`);
  const back = `/${locale}/portal/contracts/${parsed.data.contractId}`;
  const r = await declineContract(parsed.data);
  if (!r.ok) redirect(r.code === "NOT_FOUND" ? `/${locale}/portal/contracts` : `${back}?notice=failed`);
  redirect(`${back}?notice=declined`);
}
