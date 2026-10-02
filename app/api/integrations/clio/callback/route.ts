import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, getUser } from "@/server/auth/session";
import { getClioTokenStore } from "@/server/providers";
import { exchangeCode } from "@/server/providers/clio/oauth";
import { decodeOAuthState, OAUTH_COOKIE, OAUTH_COOKIE_PATH, sameState } from "@/server/security/oauth-state";
import { recordAudit } from "@/server/services/audit";

/**
 * Retour OAuth de Clio : firm_admin revérifié, `state` comparé en temps constant, code échangé
 * avec le vérificateur PKCE, jetons enregistrés dans Supabase Vault, audit. Jamais de jeton
 * dans un log, une URL ou une réponse.
 */
export async function GET(request: NextRequest) {
  const saved = decodeOAuthState(request.cookies.get(OAUTH_COOKIE)?.value);
  const locale = saved?.locale ?? "en";
  const done = (notice: string) => {
    const res = NextResponse.redirect(new URL(`/${locale}/admin/integrations?notice=${notice}`, request.url));
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const user = await getUser();
  if (!user || (await getSessionRole()) !== "firm_admin")
    return new NextResponse("Not found", { status: 404 });
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!saved || !code || !state || code.length > 512 || !sameState(state, saved.state)) return done("failed");

  try {
    const tokens = await exchangeCode(code, saved.verifier);
    await getClioTokenStore().save(tokens, { scopes: [], actorId: user.id });
  } catch {
    console.error(JSON.stringify({ event: "clio_connect_failed" }));
    return done("failed");
  }
  await recordAudit({
    action: "integration.connected",
    resourceType: "integration",
    resourceId: "clio_manage",
    actorId: user.id,
  });
  return done("connected");
}
