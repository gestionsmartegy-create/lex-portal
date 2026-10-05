import "server-only";
import { getTranslations } from "next-intl/server";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { newMessageEmail } from "@/server/providers/notifications/templates";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type Recipient = {
  id: string;
  email: string;
  role: string;
  status: string;
  first_name: string | null;
  preferred_language: string;
};

/**
 * Avis de nouveau message (J7, ADR 0017). service_role : création de notifications et lecture
 * des destinataires (usage permis : notifications, AGENTS.md §6). Jamais le contenu du message
 * (ni dans la notification, ni dans l'e-mail, ni dans un log).
 *  - clients participants (sauf l'auteur) : notification dans le portail + e-mail si leur
 *    préférence l'autorise, au plus 1 e-mail par fil et par destinataire toutes les 15 min ;
 *  - si l'auteur est un client : e-mail d'avis à l'équipe du dossier (même limite).
 * Un échec d'envoi n'annule jamais le message : il est journalisé (identifiants seulement).
 */
export async function notifyNewMessage(input: {
  conversationId: string;
  matterId: string | null;
  senderId: string;
  senderIsClient: boolean;
}) {
  try {
    const admin = createSupabaseServiceClient();
    const [{ data: participants }, { data: team }, { data: matter }] = await Promise.all([
      admin.from("conversation_participants").select("user_id").eq("conversation_id", input.conversationId),
      input.matterId && input.senderIsClient
        ? admin.from("matter_team").select("user_id").eq("matter_id", input.matterId)
        : Promise.resolve({ data: [] as { user_id: string }[] }),
      input.matterId
        ? admin.from("matters").select("display_number").eq("id", input.matterId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const ids = [...new Set([...(participants ?? []), ...(team ?? [])].map((p) => p.user_id))].filter(
      (id) => id !== input.senderId,
    );
    if (!ids.length) return;

    const [{ data: people }, { data: prefs }] = await Promise.all([
      admin.from("profiles").select("id, email, role, status, first_name, preferred_language").in("id", ids),
      admin.from("notification_preferences").select("user_id, email_enabled").in("user_id", ids),
    ]);
    const emailOn = new Map((prefs ?? []).map((p) => [p.user_id, p.email_enabled]));
    const base = serverEnv().APP_BASE_URL;

    for (const person of (people ?? []) as Recipient[]) {
      if (person.status !== "active") continue;
      const locale = person.preferred_language === "fr" ? "fr" : "en";
      const isClient = person.role === "client";
      // Le personnel n'est averti que lorsqu'un CLIENT écrit (pas des réponses de ses collègues).
      if (!isClient && !input.senderIsClient) continue;

      if (isClient) {
        const t = await getTranslations({ locale, namespace: "portal.notificationsText" });
        const { error: noteError } = await admin.from("notifications").insert({
          user_id: person.id,
          type: "new_message",
          priority: "info",
          title: t("newMessageTitle"),
          body: t("newMessageBody", { number: matter?.display_number ?? "—" }),
          matter_id: input.matterId,
          reference_type: "message", // valeurs permises par le schéma ; reference_id = le fil
          reference_id: input.conversationId,
          action_url: `/portal/messages/${input.conversationId}`,
        });
        if (noteError)
          console.error(JSON.stringify({ event: "message_notification_failed", code: noteError.code }));
      }

      if (emailOn.get(person.id) === false) continue;
      const allowed = await hitRateLimit(
        `msgmail:${input.conversationId}:${person.id}`,
        RATE_LIMITS.messageEmailPerConversation,
      );
      if (!allowed) continue;
      const path = isClient
        ? `/${locale}/portal/messages/${input.conversationId}`
        : `/${locale}/admin/messages/${input.conversationId}`;
      await getEmailSender().send(
        await newMessageEmail({
          to: person.email,
          locale,
          firstName: person.first_name,
          link: new URL(path, base).toString(),
          audience: isClient ? "client" : "staff",
        }),
      );
    }
  } catch {
    console.error(JSON.stringify({ event: "message_notify_failed", conversation: input.conversationId }));
  }
}
