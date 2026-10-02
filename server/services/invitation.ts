import "server-only";
import type { AccessLevel } from "@/types/domain";
import { isStaffEmail } from "@/lib/auth-constants";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { invitationEmail } from "@/server/providers/notifications/templates";
import { generateInvitationToken, hashToken, isWellFormedToken } from "@/server/security/tokens";
import { recordAudit } from "@/server/services/audit";

export type CreateInvitationInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  preferredLanguage: "en" | "fr";
  matterIds: string[];
  accessLevel: AccessLevel;
};

/**
 * Création par un firm_admin, AVEC SA SESSION : la RLS (invitations_admin) refait
 * le contrôle. Le jeton clair n'existe qu'en mémoire et dans l'e-mail.
 */
export async function createInvitation(input: CreateInvitationInput, invitedBy: string) {
  const supabase = await createSupabaseServerClient();
  const token = generateInvitationToken();

  const { data: invitation, error } = await supabase
    .from("client_invitations")
    .insert({
      email: input.email,
      first_name: input.firstName || null,
      last_name: input.lastName || null,
      preferred_language: input.preferredLanguage,
      token_hash: hashToken(token),
      invited_by: invitedBy,
    })
    .select("id")
    .single();
  if (error || !invitation)
    return { ok: false as const, code: error?.code === "23505" ? "DUPLICATE" : "FAILED" };

  const { error: mattersError } = await supabase.from("client_invitation_matters").insert(
    input.matterIds.map((matterId) => ({
      invitation_id: invitation.id,
      matter_id: matterId,
      access_level: input.accessLevel,
    })),
  );
  if (mattersError) {
    await supabase
      .from("client_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", invitation.id);
    return { ok: false as const, code: "FAILED" };
  }

  const link = `${serverEnv().APP_BASE_URL}/${input.preferredLanguage}/invite/${token}`;
  await getEmailSender().send(
    await invitationEmail({
      to: input.email,
      locale: input.preferredLanguage,
      firstName: input.firstName,
      link,
    }),
  );
  await recordAudit({
    action: "invitation.sent",
    resourceType: "client_invitation",
    resourceId: invitation.id,
    actorId: invitedBy,
    metadata: { matters: input.matterIds.length },
  });
  return { ok: true as const, invitationId: invitation.id };
}

/**
 * Invitation encore valide pour ce jeton (service_role : la personne invitée
 * n'a pas encore de compte — usage permis, AGENTS.md §6). Renvoie le strict
 * nécessaire à l'affichage.
 */
export async function findValidInvitation(token: string) {
  if (!isWellFormedToken(token)) return null;
  const { data } = await createSupabaseServiceClient()
    .from("client_invitations")
    .select("id, email, first_name, preferred_language")
    .eq("token_hash", hashToken(token))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data;
}

/**
 * Activation. Étapes (service_role, usage permis : acceptation d'invitation) :
 *  1. réservation ATOMIQUE pending → accepted (usage unique, même en concurrence) ;
 *  2. création du compte (e-mail confirmé) ;
 *  3. profil actif + langue AVANT l'enrôlement MFA ; accès aux dossiers ; liens.
 * Toute erreur après la réservation annule (voir rollback).
 */
export async function acceptInvitation(token: string, password: string) {
  if (!isWellFormedToken(token)) return { ok: false as const };
  const admin = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const { data: reserved } = await admin
    .from("client_invitations")
    .update({ status: "accepted", accepted_at: now })
    .eq("token_hash", hashToken(token))
    .eq("status", "pending")
    .gt("expires_at", now)
    .select(
      "id, email, first_name, last_name, preferred_language, clio_contact_id, organization_id, invited_by",
    )
    .maybeSingle();
  if (!reserved) return { ok: false as const };

  // Une invitation client vers une adresse du cabinet est révoquée, jamais activée (revue J3, M3).
  if (isStaffEmail(reserved.email)) {
    await admin
      .from("client_invitations")
      .update({ status: "revoked", revoked_at: now })
      .eq("id", reserved.id);
    return { ok: false as const };
  }

  let userId: string | null = null;
  /**
   * Compensation (revue J3, F4) : si le compte ne peut pas être supprimé, ou si
   * l'invitation ne peut pas être rouverte (une autre est déjà en attente),
   * l'invitation est RÉVOQUÉE — jamais un état « rouvert » avec un compte orphelin.
   */
  const rollback = async () => {
    let reopened = false;
    const deleted = userId ? !(await admin.auth.admin.deleteUser(userId)).error : true;
    if (deleted) {
      const { error } = await admin
        .from("client_invitations")
        .update({ status: "pending", accepted_at: null })
        .eq("id", reserved.id);
      reopened = !error;
    }
    if (!reopened) {
      await admin
        .from("client_invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", reserved.id);
    }
  };

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: reserved.email,
      password,
      email_confirm: true,
      user_metadata: { first_name: reserved.first_name, last_name: reserved.last_name },
    });
    if (createError || !created.user) throw new Error("CREATE_USER");
    userId = created.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .update({ status: "active", preferred_language: reserved.preferred_language })
      .eq("id", userId);
    if (profileError) throw new Error("PROFILE");

    const { data: matters, error: mattersError } = await admin
      .from("client_invitation_matters")
      .select("matter_id, access_level")
      .eq("invitation_id", reserved.id);
    if (mattersError || !matters?.length) throw new Error("MATTERS");

    const { error: accessError } = await admin.from("matter_access").insert(
      matters.map((m) => ({
        matter_id: m.matter_id,
        user_id: userId!,
        access_level: m.access_level,
        granted_by: reserved.invited_by,
      })),
    );
    if (accessError) throw new Error("ACCESS");

    if (reserved.clio_contact_id) {
      await admin.from("external_accounts").insert({
        user_id: userId,
        provider: "clio_manage",
        external_id: reserved.clio_contact_id,
        external_region: "ca",
      });
    }
    if (reserved.organization_id) {
      await admin
        .from("organization_members")
        .insert({ organization_id: reserved.organization_id, user_id: userId });
    }
    await admin.from("client_invitations").update({ accepted_user_id: userId }).eq("id", reserved.id);
  } catch (error) {
    console.error(JSON.stringify({ event: "invitation_accept_failed", step: (error as Error).message }));
    await rollback();
    return { ok: false as const };
  }

  return { ok: true as const, email: reserved.email, locale: reserved.preferred_language as "en" | "fr" };
}
