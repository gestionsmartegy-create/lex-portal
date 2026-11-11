import "server-only";
import { z } from "zod";
import { serverEnv } from "@/server/env";
import { OutlookError } from "./gateway";
import { outlookTokenResponseSchema, type OutlookTokens } from "./schemas";

/**
 * OAuth 2.0 Authorization Code + PKCE auprès de Microsoft Entra, locataire du cabinet seulement
 * (docs/outlook-integration.md, ADR 0043). Permissions DÉLÉGUÉES : chaque personne connecte son
 * propre agenda. Jamais de jeton dans un log, une URL ou une réponse.
 */
export const OUTLOOK_REDIRECT_PATH = "/api/integrations/outlook/callback";
export const OUTLOOK_COOKIE = "lex_outlook_oauth";
export const OUTLOOK_COOKIE_PATH = "/api/integrations/outlook";
export const OUTLOOK_COOKIE_MAX_AGE = 600;

/** Lecture des plages occupées. */
export const OUTLOOK_BASE_SCOPES = ["User.Read", "offline_access", "Calendars.ReadBasic"];
/** Demandée seulement à une personne qui active les rappels (agenda « Lex Portail »). */
export const OUTLOOK_REMINDER_SCOPE = "Calendars.ReadWrite";

export function outlookScopes(withReminders: boolean): string[] {
  return withReminders ? [...OUTLOOK_BASE_SCOPES, OUTLOOK_REMINDER_SCOPE] : OUTLOOK_BASE_SCOPES;
}

/** Vrai si les permissions accordées (chaîne de Microsoft) permettent d'écrire les rappels. */
export function canWriteReminders(scope: string | undefined): boolean {
  return (scope ?? "")
    .split(/\s+/)
    .some((s) => s.toLowerCase().endsWith(OUTLOOK_REMINDER_SCOPE.toLowerCase()));
}

function endpoint(path: "authorize" | "token"): URL {
  const tenant = serverEnv().OUTLOOK_TENANT_ID ?? "";
  return new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/${path}`);
}

export function outlookRedirectUri(): string {
  return new URL(OUTLOOK_REDIRECT_PATH, serverEnv().APP_BASE_URL).toString();
}

export function outlookAuthorizeUrl(
  state: string,
  challenge: string,
  scopes: string[],
  loginHint?: string,
): string {
  const url = endpoint("authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("client_id", serverEnv().OUTLOOK_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", outlookRedirectUri());
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // La personne choisit son compte : pas de connexion silencieuse avec un autre compte ouvert.
  url.searchParams.set("prompt", "select_account");
  // Compte attendu : celui de la session du portail (revérifié au retour, voir fetchOutlookAccount).
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<OutlookTokens> {
  const env = serverEnv();
  let res: Response;
  try {
    res = await fetchImpl(endpoint("token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        ...body,
        client_id: env.OUTLOOK_CLIENT_ID ?? "",
        client_secret: env.OUTLOOK_CLIENT_SECRET ?? "",
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OutlookError("UPSTREAM");
  }
  // 400 invalid_grant : jeton de rafraîchissement retiré ou expiré, ou code déjà utilisé.
  if (res.status === 400 || res.status === 401) throw new OutlookError("TOKEN_REVOKED");
  if (res.status === 429) throw new OutlookError("RATE_LIMITED");
  if (!res.ok) throw new OutlookError("UPSTREAM");
  const parsed = outlookTokenResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new OutlookError("INVALID_RESPONSE");
  return {
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token ?? body.refresh_token,
    expires_at: parsed.data.expires_in ? Date.now() + parsed.data.expires_in * 1000 : undefined,
    scope: parsed.data.scope,
  };
}

export function exchangeOutlookCode(code: string, verifier: string, fetchImpl?: typeof fetch) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: outlookRedirectUri(),
      code_verifier: verifier,
    },
    fetchImpl,
  );
}

export function refreshOutlookTokens(refreshToken: string, fetchImpl?: typeof fetch) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

/** État de la connexion (cookie HttpOnly, 10 min, limité au chemin de retour). */
const stateSchema = z.object({
  state: z.string().min(20),
  verifier: z.string().min(40),
  locale: z.enum(["en", "fr"]),
  reminders: z.boolean(),
  /** Personne qui a lancé la connexion : le retour est refusé pour une autre session. */
  userId: z.uuid(),
});
export type OutlookOAuthState = z.infer<typeof stateSchema>;

export function encodeOutlookState(value: OutlookOAuthState): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeOutlookState(raw: string | undefined): OutlookOAuthState | null {
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Adresses du compte Microsoft qui vient de se connecter (GET /me, permission User.Read), en
 * minuscules. Sert à refuser un agenda qui n'est pas celui de la personne connectée au portail.
 */
const accountSchema = z.object({
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

export async function fetchOutlookAccount(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetchImpl("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OutlookError("UPSTREAM");
  }
  if (!res.ok) throw new OutlookError("UPSTREAM");
  const parsed = accountSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new OutlookError("INVALID_RESPONSE");
  return [parsed.data.mail, parsed.data.userPrincipalName]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
}
