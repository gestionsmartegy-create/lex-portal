import "server-only";
import type { ClioBill, ClioContact, ClioMatter } from "./schemas";

/**
 * ClioManageGateway (docs/class-diagram.md) — lecture uniquement (Phase 2).
 * Implémentations : ClioManageClient (réel, région CA) et MockClioManageGateway.
 */
export interface ClioManageGateway {
  readonly isMock: boolean;
  findContactsByEmail(email: string): Promise<ClioContact[]>;
  listMattersForClient(clientId: number): Promise<ClioMatter[]>;
  getMatter(matterId: number): Promise<ClioMatter | null>;
  listBillsForMatter(matterId: number): Promise<ClioBill[]>;
}

/** Erreurs internes (AGENTS.md §5) : jamais la réponse brute de l'API. */
export class ClioError extends Error {
  constructor(
    readonly code: "NOT_CONNECTED" | "TOKEN_REVOKED" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}
