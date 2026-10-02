import "server-only";
import type { EmailSender, OutgoingEmail } from "./email-sender";

/** Implémentation fictive : conserve les e-mails en mémoire (tests). N'envoie rien. */
export class MockEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
  }
}
