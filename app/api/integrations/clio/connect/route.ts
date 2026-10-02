import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { authorizeUrl, createPkce } from "@/server/providers/clio/oauth";
import { getSessionRole } from "@/server/auth/session";
import {
  encodeOAuthState,
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_COOKIE_PATH,
} from "@/server/security/oauth-state";

/** Début de la connexion Clio (firm_admin, mode live). Même 404 pour tout autre cas. */
export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "fr" ? "fr" : "en";
  if ((await getSessionRole()) !== "firm_admin" || serverEnv().INTEGRATION_MODE_CLIO !== "live")
    return new NextResponse("Not found", { status: 404 });
  const { verifier, challenge, state } = createPkce();
  const response = NextResponse.redirect(authorizeUrl(state, challenge));
  response.cookies.set(OAUTH_COOKIE, encodeOAuthState({ state, verifier, locale }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // le retour de Clio est une navigation de premier niveau (GET)
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return response;
}
