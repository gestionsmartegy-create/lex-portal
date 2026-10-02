import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { recordAudit } from "@/server/services/audit";

/**
 * Retour OAuth (Microsoft) et liens de récupération : échange du code PKCE
 * contre une session (cookies HttpOnly), journalisation, puis redirection
 * INTERNE validée.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const locale = next?.startsWith("/fr") ? "fr" : "en";
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const provider = (data.user.app_metadata?.provider as string | undefined) ?? "unknown";
      await recordAudit({
        action: "auth.login",
        resourceType: "session",
        actorId: data.user.id,
        metadata: { method: provider === "azure" ? "microsoft" : "link_exchange" },
      });
      return NextResponse.redirect(new URL(safeNextPath(next, locale), url.origin));
    }
  }
  // Lien invalide ou expiré : retour à la connexion, message neutre.
  return NextResponse.redirect(new URL(`/${locale}/login?error=link`, url.origin));
}
