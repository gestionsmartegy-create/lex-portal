import { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { buildCsp, generateNonce } from "@/server/security/csp";

// Next.js 16 : « proxy » remplace « middleware » (node_modules/next/dist/docs/…/proxy.md).
const handleI18nRouting = createIntlMiddleware(routing);

export default function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Next.js lit le nonce dans l'en-tête CSP de la REQUÊTE pour l'appliquer à ses scripts.
  // next-intl recopie les en-têtes de la requête dans sa réponse (next/rewrite).
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = handleI18nRouting(new NextRequest(request, { headers }));
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Tout sauf API, fichiers statiques, optimisation d'images et fichiers avec extension.
      source: "/((?!api|_next/static|_next/image|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
