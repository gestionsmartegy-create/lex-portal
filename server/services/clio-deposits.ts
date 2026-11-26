import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getClioDocumentsGateway } from "@/server/providers";
import { ClioError } from "@/server/providers/clio/gateway";

/**
 * Dépôt du contrat validé dans Clio (ADR 0038, F11 partie Clio). La base crée les dépôts à la
 * validation ; ils sont traités aussitôt, en arrière-plan (ADR 0045), puis repris par le planificateur
 * en cas d'échec. service_role : synchronisation (usage permis, AGENTS.md §6), seulement dans
 * pushPendingDeposits. Aucune URL de Clio ni d'Amazon n'est transmise au navigateur.
 */
export type ContractDeposit = {
  id: string;
  version: number;
  target: "clio" | "sharepoint";
  status: "pending" | "done" | "failed" | "waiting";
  externalId: string | null;
  attempts: number;
  lastError: string | null;
  depositedAt: string | null;
};

export async function listContractDeposits(contractId: string): Promise<ContractDeposit[]> {
  if (!z.uuid().safeParse(contractId).success) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contract_deposits")
    .select("id, version, target, status, external_id, attempts, last_error, deposited_at")
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
    .order("target");
  return (data ?? []).map((d) => ({
    id: d.id,
    version: d.version,
    target: d.target as ContractDeposit["target"],
    status: d.status as ContractDeposit["status"],
    externalId: d.external_id,
    attempts: d.attempts,
    lastError: d.last_error,
    depositedAt: d.deposited_at,
  }));
}

/** Relance d'un dépôt en échec (équipe du contrat ; revérifié par la base). */
export async function retryDeposit(depositId: string) {
  const role = await getSessionRole();
  if ((role !== "staff" && role !== "firm_admin") || !z.uuid().safeParse(depositId).success)
    return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("contract_deposit_retry", { p_id: depositId });
  if (!error) depositInBackground();
  return { ok: !error };
}

/**
 * Dépôt immédiat, sans faire attendre l'avocat (ADR 0045) : appelé après une validation ou une relance
 * réussie, il s'exécute une fois la réponse envoyée. La réservation en base (`for update skip locked`,
 * prochain essai repoussé) empêche un double dépôt si le planificateur passe en même temps.
 * Un échec ici n'annule rien : le dépôt reste en file pour le planificateur. Le passage peut aussi
 * traiter d'autres dépôts déjà dus (au plus 5 en tout), comme le planificateur le ferait.
 */
export function depositInBackground() {
  after(async () => {
    try {
      await pushPendingDeposits(5);
    } catch {
      console.error(JSON.stringify({ event: "contract_deposits_failed", code: "UNEXPECTED" }));
    }
  });
}

/** Planificateur : dépose les PDF en attente (au plus 10 par passage, délai croissant entre essais). */
export async function pushPendingDeposits(limit = 10) {
  // Simulateur (accord du cabinet pas encore donné) : rien n'est réservé ni marqué « déposé »
  // (AGENTS.md §2.7). Les dépôts restent « en attente de l'accord du cabinet ».
  if (getClioDocumentsGateway().isMock) return { done: 0, failed: 0, mock: true };
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("contract_deposit_claim", { p_limit: limit });
  if (error) {
    console.error(JSON.stringify({ event: "contract_deposit_claim_failed", code: error.code }));
    return { done: 0, failed: 0 };
  }
  const gateway = getClioDocumentsGateway();
  let done = 0;
  let failed = 0;
  for (const d of data ?? []) {
    const matterId = /^\d{1,15}$/.test(d.clio_matter_id ?? "") ? Number(d.clio_matter_id) : null;
    const previous = /^\d{1,15}$/.test(d.previous_document_id ?? "") ? Number(d.previous_document_id) : null;
    try {
      if (!matterId || !d.pdf_base64) throw new ClioError("INVALID_RESPONSE");
      const documentId = await gateway.uploadDocument({
        matterId,
        previousDocumentId: previous,
        name: d.file_name,
        contentType: "application/pdf",
        bytes: new Uint8Array(Buffer.from(d.pdf_base64, "base64")),
      });
      await admin.rpc("contract_deposit_result", {
        p_id: d.id,
        p_ok: true,
        p_external_id: String(documentId),
        p_error: null as unknown as string,
      });
      done += 1;
    } catch (e) {
      const code = e instanceof ClioError ? e.code : "UPSTREAM";
      // Identifiants seulement (AGENTS.md §5).
      console.error(JSON.stringify({ event: "contract_deposit_failed", deposit_id: d.id, code }));
      await admin.rpc("contract_deposit_result", {
        p_id: d.id,
        p_ok: false,
        p_external_id: null as unknown as string,
        p_error: code,
      });
      failed += 1;
    }
  }
  return { done, failed, mock: gateway.isMock };
}
