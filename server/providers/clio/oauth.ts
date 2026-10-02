import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/server/env";
import { ClioError } from "./gateway";
import { tokenResponseSchema, type StoredTokens } from "./schemas";

/** OAuth 2.0 Authorization Code + PKCE, région CA (docs/clio-api-mapping.md §1). */
export const CLIO_BASE_URL = "https://ca.app.clio.com";
export const CLIO_REDIRECT_PATH = "/api/integrations/clio/callback";

export function clioRedirectUri(): string {
  return new URL(CLIO_REDIRECT_PATH, serverEnv().APP_BASE_URL).toString();
}

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

export function authorizeUrl(state: string, challenge: string): string {
  const url = new URL("/oauth/authorize", CLIO_BASE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", serverEnv().CLIO_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", clioRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredTokens> {
  const env = serverEnv();
  const res = await fetchImpl(new URL("/oauth/token", CLIO_BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      ...body,
      client_id: env.CLIO_CLIENT_ID ?? "",
      client_secret: env.CLIO_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401) throw new ClioError("TOKEN_REVOKED");
  if (!res.ok) throw new ClioError("UPSTREAM");
  const parsed = tokenResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
  return {
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token ?? body.refresh_token,
    expires_at: parsed.data.expires_in ? Date.now() + parsed.data.expires_in * 1000 : undefined,
  };
}

export function exchangeCode(code: string, verifier: string, fetchImpl?: typeof fetch) {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: clioRedirectUri(), code_verifier: verifier },
    fetchImpl,
  );
}

export function refreshTokens(refreshToken: string, fetchImpl?: typeof fetch) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}
