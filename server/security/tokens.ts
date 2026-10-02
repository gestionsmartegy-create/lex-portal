import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Jeton d'invitation : 32 octets aléatoires, base64url (43 caractères). Jamais stocké en clair. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 hexadécimale, seule valeur stockée en base (client_invitations.token_hash). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Comparaison à temps constant de deux empreintes hexadécimales. */
export function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Empreinte d'un identifiant pour les clés de limitation (jamais l'e-mail en clair). */
export function hashForKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex").slice(0, 32);
}
