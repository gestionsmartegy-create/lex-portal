import "server-only";
import nodemailer from "nodemailer";
import type { EmailSender, OutgoingEmail } from "./email-sender";

/**
 * Envoi SMTP (nodemailer). En local : Mailpit de Supabase (aucun e-mail réel).
 * En production : fournisseur à décider par le cabinet (open-questions).
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
  }
}
