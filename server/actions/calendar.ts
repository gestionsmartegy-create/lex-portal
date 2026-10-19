"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit } from "@/server/security/rate-limit";
import {
  connectMyCalendar,
  disconnectCalendar,
  setMyReminders,
  syncMyCalendar,
} from "@/server/services/calendar-connections";
import { localeSchema } from "@/server/validation/auth";

/**
 * Agendas Outlook (lot 4, ADR 0031). Chaque action revérifie la session et le rôle (requireStaff),
 * puis le service et la base revérifient encore (la personne elle-même, ou le firm_admin).
 */
type Notice =
  "connected" | "disconnected" | "synced" | "remindersOn" | "remindersOff" | "unavailable" | "failed";

/** Chaque synchronisation appellera Microsoft Graph en mode réel : 20 par personne et par 10 minutes. */
const SYNC_RULE = { max: 20, windowSeconds: 10 * 60 };

function toMyCalendar(locale: string, notice: Notice): never {
  redirect(`/${locale}/admin/my-calendar?notice=${notice}`);
}

export async function connectCalendarAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { profile } = await requireStaff(locale);
  if (!(await hitRateLimit(`calendar_sync:user:${profile.id}`, SYNC_RULE))) toMyCalendar(locale, "failed");
  const r = await connectMyCalendar();
  toMyCalendar(locale, r.ok ? "connected" : r.code === "NOT_AVAILABLE" ? "unavailable" : "failed");
}

export async function syncCalendarAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { profile } = await requireStaff(locale);
  if (!(await hitRateLimit(`calendar_sync:user:${profile.id}`, SYNC_RULE))) toMyCalendar(locale, "failed");
  const r = await syncMyCalendar();
  toMyCalendar(locale, r.ok ? "synced" : "failed");
}

export async function remindersAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { profile } = await requireStaff(locale);
  if (!(await hitRateLimit(`calendar_sync:user:${profile.id}`, SYNC_RULE))) toMyCalendar(locale, "failed");
  const parsed = z.object({ enabled: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) toMyCalendar(locale, "failed");
  const enabled = parsed.data.enabled === "true";
  const r = await setMyReminders(enabled);
  toMyCalendar(locale, r.ok ? (enabled ? "remindersOn" : "remindersOff") : "failed");
}

/** Déconnecter mon agenda : l'identifiant vient de la session, jamais du formulaire. */
export async function disconnectCalendarAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const { profile } = await requireStaff(locale);
  const r = await disconnectCalendar(profile.id);
  toMyCalendar(locale, r.ok ? "disconnected" : "failed");
}

/** Couper l'agenda d'une personne (firm_admin seulement). */
export async function cutCalendarAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z.object({ userId: z.uuid() }).safeParse(Object.fromEntries(formData));
  const r = parsed.success ? await disconnectCalendar(parsed.data.userId) : { ok: false };
  redirect(`/${locale}/admin/integrations?notice=${r.ok ? "calendarCut" : "failed"}`);
}
