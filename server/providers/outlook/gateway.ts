import "server-only";
import type { BusyBlock, ReminderEventInput } from "./schemas";

/**
 * OutlookCalendarGateway (lot 4, ADR 0031) — agenda Outlook d'un membre du personnel.
 * Lecture : plages OCCUPÉES seulement (début, fin), jamais le titre, le lieu ni les participants.
 * Écriture : rappels de préparation dans un agenda séparé « Lex Portail », jamais les dates de cour
 * elles-mêmes (Clio les recopie déjà dans Outlook : pas de doublon).
 * Implémentations : MockOutlookCalendarGateway (simulateur) et GraphOutlookCalendarGateway
 * (Microsoft Graph, ADR 0043), choisies par INTEGRATION_MODE_OUTLOOK.
 */
export interface OutlookCalendarGateway {
  readonly isMock: boolean;
  /** Plages occupées de la personne sur [from, to[ (62 jours au plus). */
  getBusyBlocks(userId: string, from: Date, to: Date): Promise<BusyBlock[]>;
  /** Agenda « Lex Portail » de la personne (créé au besoin) ; renvoie son identifiant. */
  ensureReminderCalendar(userId: string, knownId: string | null): Promise<string>;
  /** Crée ou met à jour un rappel ; renvoie l'identifiant de l'événement. */
  upsertReminder(
    userId: string,
    calendarId: string,
    eventId: string | null,
    input: ReminderEventInput,
  ): Promise<string>;
  /** Retire un rappel (déjà absent : sans effet). */
  deleteReminder(userId: string, eventId: string): Promise<void>;
}

/** Erreurs internes (AGENTS.md §5) : jamais la réponse brute de l'API. */
export class OutlookError extends Error {
  constructor(
    readonly code: "NOT_CONNECTED" | "TOKEN_REVOKED" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}
