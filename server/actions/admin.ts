"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { createInvitation } from "@/server/services/invitation";
import {
  grantMatterAccess,
  resendInvitation,
  revokeInvitation,
  revokeMatterAccess,
  setClientStatus,
} from "@/server/services/admin";
import { getClioTokenStore } from "@/server/providers";
import { recordAudit } from "@/server/services/audit";
import {
  closeConversation,
  messageBodySchema,
  sendMessage,
  startConversationAsStaff,
} from "@/server/services/messaging";
import { resetClientMfa } from "@/server/services/mfa-reset";
import { importClioContact, syncLinkedMatters } from "@/server/services/sync";
import { provisionStaff } from "@/server/services/staff";
import {
  createInvitationSchema,
  localeSchema,
  mfaResetSchema,
  provisionStaffSchema,
} from "@/server/validation/auth";

export type AdminActionState = {
  error?: "INVALID" | "DUPLICATE" | "EXISTS" | "DOMAIN" | "RATE_LIMITED" | "NOT_ELIGIBLE" | "FAILED";
  ok?: boolean;
};

/** Invitation d'un client (firm_admin). Le rôle est revérifié ici ET par la RLS. */
export async function createInvitationAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = createInvitationSchema.safeParse({ ...raw, matterIds: formData.getAll("matterIds") });
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  if (!(await hitRateLimit(`invite:user:${user.id}`, RATE_LIMITS.invitationCreateByUser)))
    return { error: "RATE_LIMITED" };

  const result = await createInvitation(
    {
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      preferredLanguage: parsed.data.preferredLanguage,
      matterIds: parsed.data.matterIds,
      accessLevel: parsed.data.accessLevel,
    },
    user.id,
  );
  if (!result.ok) return { error: result.code === "DUPLICATE" ? "DUPLICATE" : "FAILED" };
  // La liste « Invitations envoyées » de la même page doit montrer la nouvelle invitation.
  revalidatePath(`/${parsed.data.locale}/admin/invitations`);
  return { ok: true };
}

/** Pré-création d'un compte du personnel (firm_admin). */
export async function provisionStaffAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const parsed = provisionStaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await provisionStaff(
    {
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
    },
    user.id,
  );
  if (result.ok) return { ok: true };
  return { error: result.code === "EXISTS" ? "EXISTS" : result.code === "DOMAIN" ? "DOMAIN" : "FAILED" };
}

/** Réinitialisation de la MFA d'un client (firm_admin, après vérification d'identité, ADR 0012). */
export async function resetClientMfaAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const parsed = mfaResetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  if (!(await hitRateLimit(`mfa_reset:user:${user.id}`, RATE_LIMITS.mfaResetByUser)))
    return { error: "RATE_LIMITED" };
  const result = await resetClientMfa(
    { email: parsed.data.email, verification: parsed.data.verification, reason: parsed.data.reason },
    user.id,
  );
  return result.ok ? { ok: true } : { error: result.code };
}

// ---------------------------------------------------------------------------
// Espace cabinet (J5) : actions par formulaire, résultat affiché via ?notice=
// ---------------------------------------------------------------------------
const idForm = z.object({ id: z.uuid(), locale: localeSchema });

export async function setClientStatusAction(formData: FormData): Promise<void> {
  const parsed = idForm
    .extend({ status: z.enum(["active", "suspended"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await setClientStatus(parsed.data.id, parsed.data.status, user.id);
  revalidatePath(`/${parsed.data.locale}/admin/clients`);
  redirect(
    `/${parsed.data.locale}/admin/clients?notice=${result.ok ? (parsed.data.status === "suspended" ? "suspended" : "reactivated") : "failed"}`,
  );
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const parsed = idForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await revokeInvitation(parsed.data.id, user.id);
  redirect(`/${parsed.data.locale}/admin/invitations?notice=${result.ok ? "revoked" : "failed"}`);
}

export async function resendInvitationAction(formData: FormData): Promise<void> {
  const parsed = idForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  if (!(await hitRateLimit(`invite:user:${user.id}`, RATE_LIMITS.invitationCreateByUser)))
    redirect(`/${parsed.data.locale}/admin/invitations?notice=failed`);
  const result = await resendInvitation(parsed.data.id, user.id);
  redirect(`/${parsed.data.locale}/admin/invitations?notice=${result.ok ? "resent" : "failed"}`);
}

const grantSchema = z.object({
  matterId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  accessLevel: z.enum(["read", "read_write"]),
  locale: localeSchema,
});

export async function grantMatterAccessAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const parsed = grantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await grantMatterAccess(parsed.data.matterId, parsed.data.email, parsed.data.accessLevel);
  if (!result.ok) return { error: result.code };
  revalidatePath(`/${parsed.data.locale}/admin/matters/${parsed.data.matterId}`);
  return { ok: true };
}

export async function revokeMatterAccessAction(formData: FormData): Promise<void> {
  const parsed = idForm
    .extend({ matterId: z.uuid(), reason: z.string().trim().min(1).max(500) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await revokeMatterAccess(parsed.data.id, parsed.data.reason);
  redirect(
    `/${parsed.data.locale}/admin/matters/${parsed.data.matterId}?tab=team&notice=${result.ok ? "revoked" : "failed"}`,
  );
}

// ---------------------------------------------------------------------------
// Intégrations : Clio Manage en lecture (Phase 2, ADR 0014)
// ---------------------------------------------------------------------------
export type ImportState = { error?: string; ok?: boolean; matters?: number; bills?: number };

export async function importClioContactAction(_prev: unknown, formData: FormData): Promise<ImportState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email()), locale: localeSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  if (!(await hitRateLimit(`clio_import:user:${user.id}`, RATE_LIMITS.invitationCreateByUser)))
    return { error: "RATE_LIMITED" };
  const result = await importClioContact(parsed.data.email, user.id);
  if (!result.ok) return { error: result.code };
  revalidatePath(`/${parsed.data.locale}/admin`, "layout");
  return { ok: true, matters: result.matters, bills: result.bills };
}

export async function syncClioNowAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { user } = await requireStaff(locale, ["firm_admin"]);
  const result = await syncLinkedMatters(user.id);
  redirect(`/${locale}/admin/integrations?notice=${result.ok ? "synced" : "failed"}`);
}

export async function disconnectClioAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { user } = await requireStaff(locale, ["firm_admin"]);
  await getClioTokenStore().disconnect();
  await recordAudit({
    action: "integration.disconnected",
    resourceType: "integration",
    resourceId: "clio_manage",
    actorId: user.id,
  });
  redirect(`/${locale}/admin/integrations?notice=disconnected`);
}

// ---------------------------------------------------------------------------
// Messagerie du cabinet (J7, ADR 0017) — personnel de l'équipe et firm_admin
// ---------------------------------------------------------------------------
const staffReplySchema = z.object({
  conversationId: z.uuid(),
  body: messageBodySchema,
  locale: localeSchema,
});

export async function staffSendMessageAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const parsed = staffReplySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale);
  if (!(await hitRateLimit(`message:user:${user.id}`, RATE_LIMITS.messageSendByUser)))
    return { error: "RATE_LIMITED" };
  const result = await sendMessage(parsed.data.conversationId, parsed.data.body);
  if (!result.ok) return { error: "FAILED" };
  revalidatePath(`/${parsed.data.locale}/admin/messages/${parsed.data.conversationId}`);
  return { ok: true };
}

const staffStartSchema = z.object({
  matterId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  body: messageBodySchema,
  locale: localeSchema,
});

export async function staffStartConversationAction(
  _prev: unknown,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = staffStartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale);
  if (!(await hitRateLimit(`message:user:${user.id}`, RATE_LIMITS.messageSendByUser)))
    return { error: "RATE_LIMITED" };
  const result = await startConversationAsStaff(parsed.data.matterId, parsed.data.subject, parsed.data.body);
  if (!result.ok) return { error: "FAILED" };
  redirect(`/${parsed.data.locale}/admin/messages/${result.conversationId}`);
}

export async function closeConversationAction(formData: FormData): Promise<void> {
  const parsed = idForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireStaff(parsed.data.locale);
  const result = await closeConversation(parsed.data.id);
  redirect(
    `/${parsed.data.locale}/admin/messages/${parsed.data.id}?notice=${result.ok ? "closed" : "failed"}`,
  );
}
