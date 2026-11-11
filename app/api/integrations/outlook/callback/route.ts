import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, getUser } from "@/server/auth/session";
import { serverEnv } from "@/server/env";
import {
  decodeOutlookState,
  exchangeOutlookCode,
  OUTLOOK_COOKIE,
  OUTLOOK_COOKIE_PATH,
} from "@/server/providers/outlook/oauth";
import { sameState } from "@/server/security/oauth-state";
import { hitRateLimit } from "@/server/security/rate-limit";
import { saveLiveCalendarConnection } from "@/server/services/calendar-connections";

/**
 * Retour OAuth de Microsoft : personnel revérifié, `state` comparé en temps constant, code échangé
 * avec le vérificateur PKCE, jetons enregistrés dans Supabase Vault par le service (qui journalise).
 * Jamais de jeton dans un log, une URL ou une réponse.
 */
export async function GET(request: NextRequest) {
  const saved = decodeOutlookState(request.cookies.get(OUTLOOK_COOKIE)?.value);
  const locale = saved?.locale ?? "en";
  const done = (notice: "connected" | "remindersOn" | "wrongAccount" | "failed") => {
    const res = NextResponse.redirect(
      new URL(`/${locale}/admin/my-calendar?notice=${notice}`, serverEnv().APP_BASE_URL),
    );
    res.cookies.set(OUTLOOK_COOKIE, "", { path: OUTLOOK_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const user = await getUser();
  const role = await getSessionRole();
  if (!user || (role !== "staff" && role !== "firm_admin") || serverEnv().INTEGRATION_MODE_OUTLOOK !== "live")
    return new NextResponse("Not found", { status: 404 });
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  // Refus de la personne ou erreur de Microsoft : pas de code. Les codes Microsoft sont longs (≈ 1 à 2 ko).
  if (!saved || !code || !state || code.length > 4096 || !sameState(state, saved.state))
    return done("failed");
  // La connexion doit se terminer dans la session qui l'a commencée (poste partagé).
  if (saved.userId !== user.id) return done("failed");
  // Même limite que la synchronisation : chaque retour appelle Microsoft.
  if (!(await hitRateLimit(`calendar_sync:user:${user.id}`, { max: 20, windowSeconds: 600 })))
    return done("failed");

  try {
    const tokens = await exchangeOutlookCode(code, saved.verifier);
    const result = await saveLiveCalendarConnection(tokens, saved.reminders);
    if (!result.ok) return done(result.code === "ACCOUNT_MISMATCH" ? "wrongAccount" : "failed");
    return done(result.remindersOn ? "remindersOn" : "connected");
  } catch {
    console.error(JSON.stringify({ event: "outlook_connect_failed" }));
    return done("failed");
  }
}
