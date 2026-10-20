import "server-only";
import { getTranslations } from "next-intl/server";
import { formatZoned } from "@/lib/zoned-time";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { portalNoticeEmail } from "@/server/providers/notifications/templates";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import type { CourtDateKind } from "@/server/services/court-dates";

/**
 * Avis aux clients (ADR 0035). service_role : création de notifications et lecture des destinataires
 * (usage permis : notifications, AGENTS.md §6). Appelé seulement APRÈS une écriture réussie faite avec
 * la session de l'utilisateur (donc après le contrôle d'accès). La notification du portail peut donner
 * le détail ; l'e-mail n'en donne AUCUN (seulement le lien). Un échec d'avis n'annule jamais l'action :
 * il est journalisé, identifiants seulement.
 */
type Person = {
  id: string;
  email: string;
  role: string;
  status: string;
  first_name: string | null;
  preferred_language: string;
};

async function sendNotice(
  person: Person,
  kind: "contractSent" | "courtChanged",
  path: string,
  rateKey: string,
  emailOn: boolean,
) {
  if (!emailOn) return;
  const locale = person.preferred_language === "fr" ? "fr" : "en";
  if (!(await hitRateLimit(rateKey, RATE_LIMITS.messageEmailPerConversation))) return;
  await getEmailSender().send(
    await portalNoticeEmail({
      to: person.email,
      locale,
      firstName: person.first_name,
      link: new URL(`/${locale}${path}`, serverEnv().APP_BASE_URL).toString(),
      kind,
    }),
  );
}

/** Contrat envoyé : son client (compte actif) est averti dans le portail et par e-mail. */
export async function notifyContractSent(contractId: string) {
  try {
    const admin = createSupabaseServiceClient();
    const { data: c } = await admin
      .from("contracts")
      .select("id, client_id, matter_id, status, signing_mode")
      .eq("id", contractId)
      .maybeSingle();
    if (!c?.client_id || c.status !== "sent") return;
    const [{ data: person }, { data: pref }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, role, status, first_name, preferred_language")
        .eq("id", c.client_id)
        .maybeSingle(),
      admin.from("notification_preferences").select("email_enabled").eq("user_id", c.client_id).maybeSingle(),
    ]);
    if (!person || person.role !== "client" || person.status !== "active") return;
    const locale = person.preferred_language === "fr" ? "fr" : "en";
    const t = await getTranslations({ locale, namespace: "portal.notificationsText" });
    const path = `/portal/contracts/${c.id}`;
    const { error } = await admin.from("notifications").insert({
      user_id: person.id,
      type: "contract_sent",
      priority: c.signing_mode === "portal" ? "urgent" : "info",
      title: t("contractSentTitle"),
      body: c.signing_mode === "portal" ? t("contractSentBodyPortal") : t("contractSentBodyClio"),
      matter_id: c.matter_id,
      action_url: path,
    });
    if (error) console.error(JSON.stringify({ event: "contract_notification_failed", contract_id: c.id }));
    await sendNotice(
      person as Person,
      "contractSent",
      path,
      `contractmail:${c.id}:${person.id}`,
      pref?.email_enabled !== false,
    );
  } catch {
    console.error(JSON.stringify({ event: "contract_notify_failed", contract_id: contractId }));
  }
}

export type CourtDateChange = "added" | "moved" | "changed" | "cancelled";

/**
 * Date de cour ajoutée, déplacée, modifiée ou annulée : avis aux clients du dossier (accès non
 * révoqué, compte actif), seulement si la date est visible au client (décision du 2026-10-20).
 */
export async function notifyCourtDateChange(courtDateId: string, change: CourtDateChange) {
  try {
    const admin = createSupabaseServiceClient();
    const { data: d } = await admin
      .from("court_dates")
      .select("id, matter_id, kind, starts_at, all_day, timezone, visible_to_client")
      .eq("id", courtDateId)
      .maybeSingle();
    if (!d?.visible_to_client) return;
    const { data: access } = await admin
      .from("matter_access")
      .select("user_id")
      .eq("matter_id", d.matter_id)
      .is("revoked_at", null);
    const ids = (access ?? []).map((a) => a.user_id);
    if (!ids.length) return;
    const [{ data: people }, { data: prefs }] = await Promise.all([
      admin.from("profiles").select("id, email, role, status, first_name, preferred_language").in("id", ids),
      admin.from("notification_preferences").select("user_id, email_enabled").in("user_id", ids),
    ]);
    const emailOn = new Map((prefs ?? []).map((p) => [p.user_id, p.email_enabled]));
    for (const person of (people ?? []) as Person[]) {
      if (person.role !== "client" || person.status !== "active") continue;
      const locale = person.preferred_language === "fr" ? "fr" : "en";
      const [t, tKind] = await Promise.all([
        getTranslations({ locale, namespace: "portal.notificationsText" }),
        getTranslations({ locale, namespace: "admin.court.kinds" }),
      ]);
      const { error } = await admin.from("notifications").insert({
        user_id: person.id,
        type: "court_date_changed",
        priority: change === "cancelled" || change === "moved" ? "urgent" : "info",
        title: t(`courtChange.${change}`),
        body: t("courtChangeBody", {
          kind: tKind(d.kind as CourtDateKind),
          when: formatZoned(d.starts_at, d.timezone, locale, d.all_day),
        }),
        matter_id: d.matter_id,
        reference_type: "matter",
        reference_id: d.matter_id,
        action_url: "/portal/appointments",
      });
      if (error)
        console.error(JSON.stringify({ event: "court_change_notification_failed", court_date_id: d.id }));
      await sendNotice(
        person,
        "courtChanged",
        "/portal/appointments",
        `courtmail:${d.id}:${person.id}:${change === "cancelled" ? "cancelled" : "update"}`,
        emailOn.get(person.id) !== false,
      );
    }
  } catch {
    console.error(JSON.stringify({ event: "court_change_notify_failed", court_date_id: courtDateId }));
  }
}
