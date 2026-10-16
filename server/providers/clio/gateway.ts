import "server-only";
import type { ClioBill, ClioCalendar, ClioCalendarEntryInput, ClioContact, ClioMatter } from "./schemas";

/**
 * ClioManageGateway (docs/class-diagram.md) — lecture (Phase 2) et, depuis l'ADR 0025, écriture des
 * dates de cour dans un calendrier Clio (Calendar Entries : création, modification, suppression).
 * Implémentations : ClioManageClient (réel, région CA) et MockClioManageGateway.
 */
export interface ClioManageGateway {
  readonly isMock: boolean;
  findContactsByEmail(email: string): Promise<ClioContact[]>;
  listMattersForClient(clientId: number): Promise<ClioMatter[]>;
  getMatter(matterId: number): Promise<ClioMatter | null>;
  listBillsForMatter(matterId: number): Promise<ClioBill[]>;
  /** Calendriers où l'utilisateur connecté peut écrire. */
  listWritableCalendars(): Promise<ClioCalendar[]>;
  /** Crée l'entrée ; renvoie son identifiant Clio. */
  createCalendarEntry(input: ClioCalendarEntryInput): Promise<string>;
  /** Met à jour l'entrée ; false si elle n'existe plus dans Clio. */
  updateCalendarEntry(id: string, input: ClioCalendarEntryInput): Promise<boolean>;
  /** Supprime l'entrée (déjà absente : sans effet). */
  deleteCalendarEntry(id: string): Promise<void>;
}

/** Erreurs internes (AGENTS.md §5) : jamais la réponse brute de l'API. */
export class ClioError extends Error {
  constructor(
    readonly code: "NOT_CONNECTED" | "TOKEN_REVOKED" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}
