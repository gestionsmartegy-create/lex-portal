"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, requireClientSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { recordAudit } from "@/server/services/audit";
import { messageBodySchema, sendMessage, startConversation } from "@/server/services/messaging";
import {
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from "@/server/services/notification";
import { localeSchema } from "@/server/validation/auth";

/**
 * Server Actions du portail client (AGENTS.md §3) : entrée validée par Zod,
 * utilisateur revérifié, accès au dossier vérifié dans le service, RLS derrière.
 * Toutes ces actions exigent une session CLIENT (le personnel passe par server/actions/admin.ts).
 */
export type PortalActionState = { error?: string; ok?: boolean };

/** Limite d'envoi par utilisateur (revue J4/J5, M2) : 30 messages / 10 min. */
async function withinMessageLimit(): Promise<boolean> {
  const user = await getUser();
  return Boolean(user) && (await hitRateLimit(`message:user:${user!.id}`, RATE_LIMITS.messageSendByUser));
}

const sendSchema = z.object({ conversationId: z.uuid(), body: messageBodySchema, locale: localeSchema });

export async function sendMessageAction(_prev: unknown, formData: FormData): Promise<PortalActionState> {
  const parsed = sendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const code = parsed.error.issues.find((i) => i.path[0] === "body")?.message;
    return { error: code === "EMPTY" || code === "TOO_LONG" ? code : "INVALID" };
  }
  await requireClientSession(parsed.data.locale);
  if (!(await withinMessageLimit())) return { error: "RATE_LIMITED" };
  const result = await sendMessage(parsed.data.conversationId, parsed.data.body);
  if (!result.ok) return { error: result.code };
  revalidatePath(`/${parsed.data.locale}/portal/messages/${parsed.data.conversationId}`);
  return { ok: true };
}

const startSchema = z.object({
  matterId: z.uuid(),
  subject: z.string().trim().min(1, "INVALID").max(200, "INVALID"),
  body: messageBodySchema,
  locale: localeSchema,
});

export async function startConversationAction(
  _prev: unknown,
  formData: FormData,
): Promise<PortalActionState> {
  const parsed = startSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { error: code === "EMPTY" || code === "TOO_LONG" ? code : "INVALID" };
  }
  await requireClientSession(parsed.data.locale);
  if (!(await withinMessageLimit())) return { error: "RATE_LIMITED" };
  const result = await startConversation(parsed.data.matterId, parsed.data.subject, parsed.data.body);
  if (!result.ok) return { error: result.code };
  redirect(`/${parsed.data.locale}/portal/messages/${result.conversationId}`);
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireClientSession(locale);
  if (id.success) await markNotificationRead(id.data);
  revalidatePath(`/${locale}/portal`, "layout");
}

export async function markAllNotificationsReadAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireClientSession(locale);
  await markAllNotificationsRead();
  revalidatePath(`/${locale}/portal`, "layout");
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9 +().-]*$/)
    .optional(),
  preferredLanguage: localeSchema,
  emailNotifications: z.literal("on").optional(),
  locale: localeSchema,
});

/** Profil : seules les colonnes ouvertes à l'utilisateur (GRANT + RLS profiles_update_self). */
export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<PortalActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireClientSession(parsed.data.locale);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone || null,
      preferred_language: parsed.data.preferredLanguage,
    })
    .eq("id", user.id);
  const prefs = await updateNotificationPreferences({
    email_enabled: parsed.data.emailNotifications === "on",
  });
  if (error || !prefs.ok) return { error: "FAILED" };
  await recordAudit({
    action: "profile.updated",
    resourceType: "profile",
    resourceId: user.id,
    actorId: user.id,
  });
  revalidatePath(`/${parsed.data.locale}/portal`, "layout");
  if (parsed.data.preferredLanguage !== parsed.data.locale)
    redirect(`/${parsed.data.preferredLanguage}/portal/profile`);
  return { ok: true };
}
