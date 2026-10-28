import "server-only";
import type {
  ClioBill,
  ClioCalendar,
  ClioCalendarEntryInput,
  ClioCalendarEntryState,
  ClioContact,
  ClioMatter,
  ClioMatterCalendarEntry,
} from "./schemas";

/** Dépôt d'un fichier dans un dossier Clio (ADR 0038). */
export type ClioDocumentUpload = {
  matterId: number;
  /** Document Clio existant : le fichier en devient une nouvelle version. */
  previousDocumentId: number | null;
  name: string;
  contentType: "application/pdf";
  bytes: Uint8Array;
};

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
  /** Heure actuelle de l'entrée dans Clio (retour Clio, ADR 0031) ; « gone » si elle a été supprimée. */
  getCalendarEntry(id: string): Promise<ClioCalendarEntryState>;
  /** Dépose un fichier (Documents : création, envoi signé, fin du dépôt) ; renvoie l'identifiant du document. */
  uploadDocument(input: ClioDocumentUpload): Promise<number>;
  /** Entrées d'agenda d'un dossier, modifiées depuis une date (facultatif). */
  listMatterCalendarEntries(
    matterId: number,
    updatedSince: string | null,
  ): Promise<ClioMatterCalendarEntry[]>;
}

/** Erreurs internes (AGENTS.md §5) : jamais la réponse brute de l'API. */
export class ClioError extends Error {
  constructor(
    readonly code: "NOT_CONNECTED" | "TOKEN_REVOKED" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}
