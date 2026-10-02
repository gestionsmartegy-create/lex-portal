import { NextResponse, type NextRequest } from "next/server";
import { TIMEOUT_REASON } from "@/lib/session-timeout";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/env";
import { recordAudit } from "@/server/services/audit";

/**
 * Fin d'une session expirée (ADR 0012), atteinte par la redirection de proxy.ts.
 * La base est REconsultée : une session encore active n'est jamais coupée ici
 * (un lien tiers vers cette adresse ne peut pas déconnecter quelqu'un).
 */
export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "fr" ? "fr" : "en";
  const admin = request.nextUrl.searchParams.get("area") === "admin";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: status } = await supabase.rpc("touch_session");
    if (status === "active")
      return NextResponse.redirect(
        new URL(`/${locale}/${admin ? "admin" : "portal"}`, serverEnv().APP_BASE_URL),
        303,
      );
    await supabase.auth.signOut({ scope: "local" });
    await recordAudit({
      action: "auth.session_timeout",
      resourceType: "session",
      actorId: user.id,
      metadata: { trigger: "server" },
    });
  }
  const target = new URL(`/${locale}/${admin ? "staff/login" : "login"}`, serverEnv().APP_BASE_URL);
  target.searchParams.set("reason", TIMEOUT_REASON);
  return NextResponse.redirect(target, 303);
}
