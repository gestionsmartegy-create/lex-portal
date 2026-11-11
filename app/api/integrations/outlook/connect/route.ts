import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, getUser } from "@/server/auth/session";
import { serverEnv } from "@/server/env";
import { createPkce } from "@/server/providers/clio/oauth";
import {
  encodeOutlookState,
  OUTLOOK_COOKIE,
  OUTLOOK_COOKIE_MAX_AGE,
  OUTLOOK_COOKIE_PATH,
  outlookAuthorizeUrl,
  outlookScopes,
} from "@/server/providers/outlook/oauth";

/**
 * Début de la connexion de MON agenda Outlook (personnel, mode live). Même 404 pour tout autre cas.
 * `reminders=1` : demande aussi le droit d'écrire les rappels (agenda « Lex Portail »).
 */
export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "fr" ? "fr" : "en";
  const reminders = request.nextUrl.searchParams.get("reminders") === "1";
  const role = await getSessionRole();
  const user = await getUser();
  if (!user || (role !== "staff" && role !== "firm_admin") || serverEnv().INTEGRATION_MODE_OUTLOOK !== "live")
    return new NextResponse("Not found", { status: 404 });
  const { verifier, challenge, state } = createPkce();
  const response = NextResponse.redirect(
    outlookAuthorizeUrl(state, challenge, outlookScopes(reminders), user.email ?? undefined),
  );
  response.cookies.set(
    OUTLOOK_COOKIE,
    encodeOutlookState({ state, verifier, locale, reminders, userId: user.id }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // le retour de Microsoft est une navigation de premier niveau (GET)
      path: OUTLOOK_COOKIE_PATH,
      maxAge: OUTLOOK_COOKIE_MAX_AGE,
    },
  );
  return response;
}
