import "server-only";
import { getTranslations } from "next-intl/server";
import type { OutgoingEmail } from "./email-sender";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * E-mail d'invitation : AUCUNE donnée de dossier, seulement le lien d'activation
 * (usage unique, 72 h). Textes traduits (messages/*.json → emails.invitation).
 */
export async function invitationEmail(params: {
  to: string;
  locale: "en" | "fr";
  firstName?: string | null;
  link: string;
}): Promise<OutgoingEmail> {
  const t = await getTranslations({ locale: params.locale, namespace: "emails.invitation" });
  const greeting = params.firstName ? t("greetingName", { name: params.firstName }) : t("greeting");
  const lines = [
    greeting,
    "",
    t("body"),
    "",
    params.link,
    "",
    t("expiry"),
    "",
    t("ignore"),
    "",
    t("signature"),
  ];
  const html = `<!doctype html><html lang="${params.locale}"><body style="font-family:Arial,sans-serif;color:#0d1b3e;max-width:560px">
<p>${escapeHtml(greeting)}</p><p>${escapeHtml(t("body"))}</p>
<p><a href="${escapeHtml(params.link)}" style="display:inline-block;background:#0d1b3e;color:#fff;padding:12px 24px;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;font-size:13px">${escapeHtml(t("cta"))}</a></p>
<p style="color:#4a4a5a;font-size:13px">${escapeHtml(t("expiry"))}</p>
<p style="color:#4a4a5a;font-size:13px">${escapeHtml(t("ignore"))}</p>
<p>${escapeHtml(t("signature"))}</p></body></html>`;
  return { to: params.to, subject: t("subject"), text: lines.join("\n"), html };
}

/**
 * Réinitialisation de la MFA par le cabinet (ADR 0012) : information + lien de
 * nouveau mot de passe (usage unique, 1 h). Aucune donnée de dossier.
 */
export async function mfaResetEmail(params: {
  to: string;
  locale: "en" | "fr";
  firstName?: string | null;
  link: string;
}): Promise<OutgoingEmail> {
  const t = await getTranslations({ locale: params.locale, namespace: "emails.mfaReset" });
  const greeting = params.firstName ? t("greetingName", { name: params.firstName }) : t("greeting");
  const lines = [
    greeting,
    "",
    t("body"),
    "",
    t("action"),
    "",
    params.link,
    "",
    t("expiry"),
    "",
    t("warning"),
    "",
    t("signature"),
  ];
  const html = `<!doctype html><html lang="${params.locale}"><body style="font-family:Arial,sans-serif;color:#0d1b3e;max-width:560px">
<p>${escapeHtml(greeting)}</p><p>${escapeHtml(t("body"))}</p><p>${escapeHtml(t("action"))}</p>
<p><a href="${escapeHtml(params.link)}" style="display:inline-block;background:#0d1b3e;color:#fff;padding:12px 24px;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;font-size:13px">${escapeHtml(t("cta"))}</a></p>
<p style="color:#4a4a5a;font-size:13px">${escapeHtml(t("expiry"))}</p>
<p style="font-size:13px"><strong>${escapeHtml(t("warning"))}</strong></p>
<p>${escapeHtml(t("signature"))}</p></body></html>`;
  return { to: params.to, subject: t("subject"), text: lines.join("\n"), html };
}
