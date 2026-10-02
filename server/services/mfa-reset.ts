import "server-only";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { mfaResetEmail } from "@/server/providers/notifications/templates";
import { recordAudit } from "@/server/services/audit";

export type MfaResetInput = {
  email: string;
  verification: "callback_known_number" | "in_person_id";
  reason: "lost_device" | "new_device" | "other";
};

/**
 * Procédure « téléphone perdu » (ADR 0012, docs/runbooks/mfa-reset.md), par un
 * firm_admin APRÈS vérification d'identité hors ligne. service_role : API admin
 * Auth et révocation des sessions (usage permis : gestion des accès, AGENTS.md §6).
 *  1. suppression de tous les facteurs MFA ;
 *  2. révocation de toutes les sessions ;
 *  3. mot de passe remplacé par une valeur aléatoire jamais affichée — sinon un
 *     tiers qui connaît l'ancien mot de passe pourrait enrôler SON téléphone ;
 *  4. e-mail au client : information + lien de nouveau mot de passe (1 h) ;
 *  5. audit (auteur, compte, méthode de vérification, motif).
 * Seuls les comptes CLIENTS sont concernés : la MFA du personnel relève de Microsoft Entra.
 */
export async function resetClientMfa(input: MfaResetInput, actorId: string) {
  const admin = createSupabaseServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, first_name, preferred_language")
    .eq("email", input.email)
    .maybeSingle();
  if (!profile || profile.role !== "client" || profile.id === actorId)
    return { ok: false as const, code: "NOT_ELIGIBLE" as const };

  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: profile.id });
  if (listError) return { ok: false as const, code: "FAILED" as const };
  for (const factor of factors.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: profile.id });
    if (error) return { ok: false as const, code: "FAILED" as const };
  }

  const { error: revokeError } = await admin.rpc("revoke_user_sessions", { p_user: profile.id });
  if (revokeError) return { ok: false as const, code: "FAILED" as const };

  // Valeur conforme à la politique (4 classes), jamais conservée ni affichée.
  const throwaway = `${randomBytes(32).toString("base64url")}aA1!`;
  const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, { password: throwaway });
  if (passwordError) return { ok: false as const, code: "FAILED" as const };

  // Lien de récupération par token_hash (pas de PKCE : la demande ne vient pas du navigateur du client).
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
  });
  if (linkError || !link.properties?.hashed_token) return { ok: false as const, code: "FAILED" as const };

  const locale = profile.preferred_language === "fr" ? "fr" : "en";
  const url = new URL("/api/auth/callback", serverEnv().APP_BASE_URL);
  url.searchParams.set("token_hash", link.properties.hashed_token);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", `/${locale}/reset-password`);
  await getEmailSender().send(
    await mfaResetEmail({ to: input.email, locale, firstName: profile.first_name, link: url.toString() }),
  );

  await recordAudit({
    action: "auth.mfa_reset",
    resourceType: "profile",
    resourceId: profile.id,
    actorId,
    metadata: {
      verification: input.verification,
      reason: input.reason,
      factors_removed: factors.factors.length,
    },
  });
  return { ok: true as const };
}
