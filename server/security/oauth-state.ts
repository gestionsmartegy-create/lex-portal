import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * État OAuth (state + vérificateur PKCE) conservé dans un cookie HttpOnly, limité au
 * chemin de retour et valable 10 min. Le retour n'est accepté que si `state` correspond
 * (protection CSRF de la connexion d'intégration).
 */
export const OAUTH_COOKIE = "lex_clio_oauth";
export const OAUTH_COOKIE_PATH = "/api/integrations/clio";
export const OAUTH_COOKIE_MAX_AGE = 600;

const stateSchema = z.object({
  state: z.string().min(20),
  verifier: z.string().min(40),
  locale: z.enum(["en", "fr"]),
});
export type OAuthState = z.infer<typeof stateSchema>;

export function encodeOAuthState(value: OAuthState): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
