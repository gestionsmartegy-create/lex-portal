import "server-only";
import nodemailer from "nodemailer";
import type { EmailSender, OutgoingEmail } from "./email-sender";

/**
 * Envoi SMTP (nodemailer). En local : Mailpit de Supabase (aucun e-mail réel).
 * Préproduction / production : SMTP Microsoft 365 (ADR 0013). Hors local, STARTTLS est
 * EXIGÉ (requireTLS) : jamais d'envoi en clair, même si le serveur ne propose pas TLS.
 */
/** Hors local, impose STARTTLS sur smtp:// (smtps:// est chiffré d'emblée). */
export function smtpTransportUrl(smtpUrl: string): string {
  const url = new URL(smtpUrl);
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (!local && url.protocol === "smtp:") url.searchParams.set("requireTLS", "true");
  return url.toString();
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpTransportUrl(smtpUrl));
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
  }
}
