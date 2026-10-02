import "server-only";

/** Interface d'envoi d'e-mails (AGENTS.md §8). Le contenu ne porte jamais d'information sensible. */
export type OutgoingEmail = { to: string; subject: string; text: string; html: string };

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}
