import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { formatZoned } from "@/lib/zoned-time";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { serverEnv } from "@/server/env";
import { getEmailSender } from "@/server/providers/notifications";
import { courtDateReminderEmail } from "@/server/providers/notifications/templates";
import type { CourtDateKind } from "@/server/services/court-dates";
import type { Timezone } from "@/server/services/offices";

/**
 * Dates de cour côté client (ADR 0028, lot 5). Le client ne voit que les dates que l'avocat a
 * rendues visibles, lues par public.client_court_dates (colonnes limitées, session MFA).
 */
export type ClientCourtDate = {
  id: string;
  matter_id: string;
  display_number: string | null;
  kind: CourtDateKind;
  status: "scheduled" | "confirmed";
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  timezone: Timezone;
  court_name_fr: string | null;
  court_name_en: string | null;
  court_address: string | null;
  room: string | null;
  mode: "in_person" | "virtual" | "hybrid";
  virtual_link: string | null;
  client_instructions: string | null;
};

export async function listClientCourtDates(matterId?: string): Promise<ClientCourtDate[]> {
  if (matterId && !z.uuid().safeParse(matterId).success) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("client_court_dates", matterId ? { p_matter: matterId } : {});
  // Lien virtuel : https seulement (déjà exigé par la base), revérifié avant affichage.
  return ((data ?? []) as unknown as ClientCourtDate[]).map((d) => ({
    ...d,
    virtual_link: d.virtual_link && /^https:\/\/\S+$/.test(d.virtual_link) ? d.virtual_link : null,
  }));
}

/**
 * Rappels J-7 et J-1 (planificateur). service_role : notifications et lecture des destinataires
 * (usage permis, AGENTS.md §6). Une seule fois par date, par client et par sorte de rappel
 * (private.court_date_reminders). Destinataires revérifiés : client actif, accès NON révoqué.
 * La notification du portail donne la date ; l'e-mail ne contient AUCUN détail (pas de tribunal,
 * pas de dossier, pas d'heure) : seulement l'invitation à se connecter.
 */
export async function pushCourtDateReminders(now: Date = new Date()) {
  const admin = createSupabaseServiceClient();
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const { data: dates } = await admin
    .from("court_dates")
    .select("id, matter_id, kind, starts_at, all_day, timezone, matters(display_number)")
    .eq("visible_to_client", true)
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", in7)
    .order("starts_at", { ascending: true })
    .limit(500);
  if ((dates ?? []).length >= 500) console.error(JSON.stringify({ event: "court_reminders_limit_reached" }));
  let sent = 0;
  let failed = 0;
  const base = serverEnv().APP_BASE_URL;
  for (const d of dates ?? []) {
    const hoursLeft = (new Date(d.starts_at).getTime() - now.getTime()) / 3_600_000;
    const kind: "7d" | "1d" = hoursLeft <= 24 ? "1d" : "7d";
    const { data: access } = await admin
      .from("matter_access")
      .select("user_id")
      .eq("matter_id", d.matter_id)
      .is("revoked_at", null);
    const ids = (access ?? []).map((a) => a.user_id);
    if (!ids.length) continue;
    const [{ data: people }, { data: prefs }] = await Promise.all([
      admin.from("profiles").select("id, email, role, status, first_name, preferred_language").in("id", ids),
      admin.from("notification_preferences").select("user_id, email_enabled").in("user_id", ids),
    ]);
    const emailOn = new Map((prefs ?? []).map((p) => [p.user_id, p.email_enabled]));
    for (const person of people ?? []) {
      if (person.role !== "client" || person.status !== "active") continue;
      // Réservation : un rappel par date, client et sorte, même si deux passages se chevauchent.
      const { data: claimed } = await admin.rpc("claim_court_date_reminder", {
        p_court_date: d.id,
        p_user: person.id,
        p_kind: kind,
      });
      if (!claimed) continue;
      const locale = person.preferred_language === "fr" ? "fr" : "en";
      const t = await getTranslations({ locale, namespace: "portal.notificationsText" });
      const tKind = await getTranslations({ locale, namespace: "admin.court.kinds" });
      const { error: noteError } = await admin.from("notifications").insert({
        user_id: person.id,
        type: "court_date_reminder",
        priority: kind === "1d" ? "urgent" : "info",
        title: kind === "1d" ? t("courtTomorrowTitle") : t("courtSoonTitle"),
        body: t("courtReminderBody", {
          kind: tKind(d.kind as CourtDateKind),
          when: formatZoned(d.starts_at, d.timezone, locale, d.all_day),
        }),
        matter_id: d.matter_id,
        reference_type: "matter",
        reference_id: d.matter_id,
        action_url: `/${locale}/portal/appointments`,
      });
      if (noteError) {
        // Identifiants seulement ; le rappel est déjà réservé et ne sera pas renvoyé automatiquement.
        console.error(JSON.stringify({ event: "court_reminder_notification_failed", court_date_id: d.id }));
        failed += 1;
        continue;
      }
      if (emailOn.get(person.id) !== false) {
        try {
          await getEmailSender().send(
            await courtDateReminderEmail({
              to: person.email,
              locale,
              firstName: person.first_name,
              link: `${base}/${locale}/portal/appointments`,
            }),
          );
        } catch {
          console.error(JSON.stringify({ event: "court_reminder_email_failed" }));
        }
      }
      sent += 1;
    }
  }
  return { sent, failed };
}
