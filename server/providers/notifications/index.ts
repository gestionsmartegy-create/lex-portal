import "server-only";
import { serverEnv } from "@/server/env";
import type { EmailSender } from "./email-sender";
import { MockEmailSender } from "./mock";
import { SmtpEmailSender } from "./smtp";

let sender: EmailSender | undefined;

/** SMTP si SMTP_URL est défini (Mailpit en local), sinon mock (aucun envoi). */
export function getEmailSender(): EmailSender {
  if (!sender) {
    const env = serverEnv();
    sender = env.SMTP_URL ? new SmtpEmailSender(env.SMTP_URL, env.EMAIL_FROM) : new MockEmailSender();
  }
  return sender;
}

export type { EmailSender, OutgoingEmail } from "./email-sender";
