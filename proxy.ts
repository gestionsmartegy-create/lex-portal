import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE_OPTIONS } from "@/server/db/cookie-options";
import { buildCsp, buildReportOnlyCsp, generateNonce, reportingEndpoints } from "@/server/security/csp";

// Next.js 16 : « proxy » remplace « middleware » (node_modules/next/dist/docs/…/proxy.md).
const handleI18nRouting = createIntlMiddleware(routing);

const PROTECTED_CLIENT = /^\/(en|fr)\/portal(\/|$)/;
const PROTECTED_STAFF = /^\/(en|fr)\/admin(\/|$)/;

type PendingCookie = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * 1) Rafraîchit la session Supabase (cookies HttpOnly) ;
 * 2) redirection RAPIDE des pages protégées sans utilisateur (le contrôle
 *    définitif est dans les layouts serveur et la RLS — ADR 0010) ;
 * 3) nonce CSP + routage de langue.
 */
export default async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const pending: PendingCookie[] = [];
  let hasUser = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            request.cookies.set(name, value); // visible du rendu de cette requête
            pending.push({ name, value, options });
          }
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    hasUser = Boolean(data.user);
  }

  const path = request.nextUrl.pathname;
  const locale = path.startsWith("/fr") ? "fr" : "en";
  let response: NextResponse;

  if (!hasUser && PROTECTED_CLIENT.test(path)) {
    const target = new URL(`/${locale}/login`, request.url);
    target.searchParams.set("next", path);
    response = NextResponse.redirect(target);
  } else if (!hasUser && PROTECTED_STAFF.test(path)) {
    response = NextResponse.redirect(new URL(`/${locale}/staff/login`, request.url));
  } else {
    // Next.js lit le nonce dans l'en-tête CSP de la REQUÊTE pour l'appliquer à ses scripts.
    // next-intl recopie les en-têtes (cookies rafraîchis compris) dans sa réponse.
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    response = handleI18nRouting(new NextRequest(request, { headers }));
  }

  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Content-Security-Policy-Report-Only", buildReportOnlyCsp());
  response.headers.set("Reporting-Endpoints", reportingEndpoints(request.nextUrl.origin));
  // Pages authentifiées : jamais mises en cache par un intermédiaire.
  if (PROTECTED_CLIENT.test(path) || PROTECTED_STAFF.test(path))
    response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [
    {
      // Tout, sauf une liste EXPLICITE de ressources statiques (ADR 0009, F4) : une page
      // dont l'URL contient un point (« /en/x.y ») reçoit donc bien sa CSP.
      // /api reçoit une CSP de repli stricte via next.config.ts.
      source:
        "/((?!api/|\\.well-known/|_next/static/|_next/image|_vercel/|brand/|favicon\\.ico$|icon\\.png$|apple-icon\\.png$|robots\\.txt$|sitemap\\.xml$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
