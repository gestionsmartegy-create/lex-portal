import "server-only";
import type { AppointmentRow } from "@/types/portal";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertMatterAccess } from "@/server/services/access-control";

const COLUMNS =
  "id, matter_id, title, description, starts_at, ends_at, timezone, location, meeting_url, with_staff_name, status, matters(display_number, is_mock)";

export async function listAppointments(opts: { matterId?: string } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("appointments").select(COLUMNS).order("starts_at");
  if (opts.matterId) {
    await assertMatterAccess(opts.matterId);
    query = query.eq("matter_id", opts.matterId);
  }
  const { data } = await query;
  const rows = (data ?? []) as unknown as AppointmentRow[];
  const now = Date.now();
  return {
    upcoming: rows.filter((a) => new Date(a.starts_at).getTime() >= now),
    past: rows.filter((a) => new Date(a.starts_at).getTime() < now).reverse(),
  };
}

export async function getAppointment(id: string): Promise<AppointmentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("appointments").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as AppointmentRow | null) ?? null;
}

const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
/** URL (RFC 5545 : valeur URI, non échappée) : https uniquement, sans retour à la ligne. */
const icsUri = (s: string) => (/^https:\/\//.test(s) ? s.replace(/[\r\n]/g, "") : null);
const icsDate = (d: string) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Fichier .ics (RFC 5545) : aucune donnée au-delà du rendez-vous lui-même. */
export function toIcs(a: AppointmentRow, now: Date = new Date()): string {
  const end = a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 3600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lex Canada Law//Client Portal//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${a.id}@portal.lexcanadalaw.com`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(a.starts_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`${a.title} — Lex Canada Law`)}`,
    ...(a.location ? [`LOCATION:${icsText(a.location)}`] : []),
    ...(a.meeting_url && icsUri(a.meeting_url) ? [`URL:${icsUri(a.meeting_url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}
