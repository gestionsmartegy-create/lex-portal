import "server-only";
import { isStaffEmail } from "@/lib/auth-constants";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { recordAudit } from "@/server/services/audit";

/**
 * Pré-création d'un compte du personnel (ADR 0010) : le firm_admin crée le
 * compte (sans mot de passe) ; la première connexion Microsoft s'y rattache
 * par l'e-mail vérifié. Aucun droit tant qu'il n'y a pas de session Microsoft.
 * service_role : API admin Auth (usage permis, AGENTS.md §6).
 */
export async function provisionStaff(
  input: { email: string; firstName: string; lastName: string; role: "staff" | "firm_admin" },
  actorId: string,
) {
  if (!isStaffEmail(input.email)) return { ok: false as const, code: "DOMAIN" };
  // Les domaines de démonstration *.test n'existent qu'en local.
  if (input.email.endsWith(".test") && serverEnv().NODE_ENV === "production")
    return { ok: false as const, code: "DOMAIN" };

  const admin = createSupabaseServiceClient();
  // Autorisation préalable exigée par la base pour un compte non-Microsoft du domaine (migration 160000).
  const { error: authError } = await admin.rpc("authorize_staff_provisioning", {
    p_email: input.email,
    p_role: input.role,
    p_actor: actorId,
  });
  if (authError) return { ok: false as const, code: "DOMAIN" };

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName },
  });
  if (error || !data.user) return { ok: false as const, code: error?.status === 422 ? "EXISTS" : "FAILED" };

  // Rôle et statut : réservés au serveur (guard_profile) ; la garde de domaine s'applique.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: input.role, status: "active", first_name: input.firstName, last_name: input.lastName })
    .eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false as const, code: "FAILED" };
  }

  await recordAudit({
    action: "staff.provisioned",
    resourceType: "profile",
    resourceId: data.user.id,
    actorId,
    metadata: { role: input.role },
  });
  return { ok: true as const, userId: data.user.id };
}
