"use server";

import "server-only";
import { redirect } from "next/navigation";
import { requireClientSession } from "@/server/auth/session";
import { acceptContract, acceptSchema } from "@/server/services/client-contracts";
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
