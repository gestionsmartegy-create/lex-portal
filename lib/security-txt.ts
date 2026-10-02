/**
 * security.txt (RFC 9116, ADR 0011). Adresse de signalement des failles fournie
 * par le responsable du projet le 2026-10-02 (boîte du cabinet, pas un secret).
 */
export const SECURITY_CONTACT_EMAIL = "admin@lexcanadalaw.com";
const VALIDITY_DAYS = 180;

export function buildSecurityTxt(baseUrl: string, now: Date = new Date()): string {
  const expires = new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: mailto:${SECURITY_CONTACT_EMAIL}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en, fr",
    `Canonical: ${new URL("/.well-known/security.txt", baseUrl).href}`,
    "",
  ].join("\n");
}
