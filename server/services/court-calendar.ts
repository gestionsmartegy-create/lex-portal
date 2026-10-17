import "server-only";
import { z } from "zod";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { courtDateKinds, type CourtDateKind, type CourtDateStatus } from "@/server/services/court-dates";
import type { Timezone } from "@/server/services/offices";

/**
 * Calendrier de cour (ADR 0026, lot 3) : vue générale (firm_admin : tout le cabinet) ou dossiers de ses
 * équipes (RLS), par bureau, avocat, tribunal, sorte ; conflits d'horaire des avocats présents.
 * Lecture seule : les dates se saisissent dans l'onglet « Cour » du dossier (ADR 0025).
 */
export const calendarViews = ["month", "week", "list"] as const;
export type CalendarView = (typeof calendarViews)[number];
/** Vraie date du calendrier (pas « 2026-13-45 »), entre 2000 et 2100 : sinon, retour à aujourd'hui. */
const day = z.iso.date().refine((d) => d >= "2000-01-01" && d <= "2100-12-31");

export const calendarFiltersSchema = z.object({
  view: z.enum(calendarViews).catch("list"),
  date: day.optional().catch(undefined),
  office: z.uuid().optional().catch(undefined),
  lawyer: z.uuid().optional().catch(undefined),
  court: z.uuid().optional().catch(undefined),
  kind: z.enum(courtDateKinds).optional().catch(undefined),
  status: z.enum(["active", "to_confirm", "all"]).catch("active"),
  mine: z.enum(["1"]).optional().catch(undefined),
});
export type CalendarFilters = z.infer<typeof calendarFiltersSchema>;

export type CalendarItem = {
  id: string;
  matterId: string;
  matterNumber: string | null;
  matterTitle: string;
  officeId: string | null;
  kind: CourtDateKind;
  status: CourtDateStatus;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timezone: Timezone;
  courtId: string | null;
  room: string | null;
  attendeeIds: string[];
  /** Membre de l'équipe du dossier (ou firm_admin) : peut ouvrir le dossier. */
  onTeam: boolean;
  /** Jour local (AAAA-MM-JJ) dans le fuseau du tribunal : place la date dans la grille. */
  localDay: string;
  conflict: boolean;
};

/** Marge minimale entre deux dates d'un même avocat dans deux tribunaux différents (déplacement). */
export const TRAVEL_MINUTES = 60;
const LIMIT = 500;

export function todayIn(timeZone: string = DEFAULT_TIMEZONE, at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

function shiftDays(isoDay: string, days: number) {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Période affichée (jours inclus) : mois entier complété aux semaines (dimanche → samedi),
 * semaine (dimanche → samedi), ou liste (30 jours à partir du jour choisi).
 */
export function periodOf(view: CalendarView, anchor: string) {
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  if (view === "week") {
    const start = shiftDays(anchor, -weekday);
    return { start, end: shiftDays(start, 6), prev: shiftDays(anchor, -7), next: shiftDays(anchor, 7) };
  }
  if (view === "month") {
    const first = `${anchor.slice(0, 8)}01`;
    const nextMonth = new Date(`${first}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const last = shiftDays(nextMonth.toISOString().slice(0, 10), -1);
    const start = shiftDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
    const end = shiftDays(last, 6 - new Date(`${last}T12:00:00Z`).getUTCDay());
    const prev = new Date(`${first}T12:00:00Z`);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    return { start, end, prev: prev.toISOString().slice(0, 10), next: nextMonth.toISOString().slice(0, 10) };
  }
  return {
    start: anchor,
    end: shiftDays(anchor, 29),
    prev: shiftDays(anchor, -30),
    next: shiftDays(anchor, 30),
  };
}

/** Jours d'une période (pour la grille). */
export function daysOf(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = shiftDays(d, 1)) out.push(d);
  return out;
}

const localDayOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

/**
 * Conflits : deux dates actives d'un même avocat présent qui se chevauchent, ou qui laissent moins de
 * TRAVEL_MINUTES entre deux tribunaux différents. Une date sans fin compte pour une heure.
 */
export function markConflicts<
  T extends Pick<
    CalendarItem,
    "id" | "startsAt" | "endsAt" | "allDay" | "status" | "courtId" | "attendeeIds"
  >,
>(items: T[]): Set<string> {
  const conflicts = new Set<string>();
  const active = items.filter((i) => (i.status === "scheduled" || i.status === "confirmed") && !i.allDay);
  const span = (i: T) => {
    const start = new Date(i.startsAt).getTime();
    return [start, i.endsAt ? new Date(i.endsAt).getTime() : start + 3_600_000] as const;
  };
  for (let a = 0; a < active.length; a += 1) {
    for (let b = a + 1; b < active.length; b += 1) {
      const x = active[a]!;
      const y = active[b]!;
      if (!x.attendeeIds.some((id) => y.attendeeIds.includes(id))) continue;
      const [xs, xe] = span(x);
      const [ys, ye] = span(y);
      const gap = Math.max(ys - xe, xs - ye); // négatif : chevauchement
      const travel = x.courtId !== y.courtId ? TRAVEL_MINUTES * 60_000 : 0;
      if (gap < travel || gap < 0) {
        conflicts.add(x.id);
        conflicts.add(y.id);
      }
    }
  }
  return conflicts;
}

type FeedRow = {
  id: string;
  matter_id: string;
  kind: CourtDateKind;
  status: CourtDateStatus;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  timezone: Timezone;
  court_id: string | null;
  room: string | null;
  display_number: string | null;
  /** null hors de ses équipes (minimisation, ADR 0027). */
  title: string | null;
  office_id: string | null;
  attendee_ids: string[];
  on_team: boolean;
};

/**
 * Lecture par public.court_calendar_feed (ADR 0027) : colonnes limitées (jamais les notes internes,
 * le lien virtuel ni les consignes), dossiers de ses équipes, ou tout le cabinet pour le firm_admin
 * et les adjoint·e·s désigné·e·s.
 */
async function fetchDates(fromIso: string, toIso: string): Promise<CalendarItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("court_calendar_feed", { p_from: fromIso, p_to: toIso });
  return ((data ?? []) as unknown as FeedRow[]).map((r) => ({
    id: r.id,
    matterId: r.matter_id,
    matterNumber: r.display_number,
    matterTitle: r.title ?? "",
    officeId: r.office_id,
    kind: r.kind,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    timezone: r.timezone,
    courtId: r.court_id,
    room: r.room,
    attendeeIds: r.attendee_ids ?? [],
    onTeam: r.on_team,
    localDay: localDayOf(r.starts_at, r.timezone),
    conflict: false,
  }));
}

/** Vue de tout le cabinet : firm_admin ou adjoint·e désigné·e. */
async function seesWholeFirm(role: string, userId: string | undefined) {
  if (role === "firm_admin") return true;
  if (!userId) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("court_calendar_viewers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getCourtCalendar(filters: CalendarFilters) {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return null;
  const user = await getUser();
  const anchor = filters.date ?? todayIn();
  const period = periodOf(filters.view, anchor);
  // Marge d'un jour de chaque côté : les fuseaux décalent le jour local d'une date.
  const all = await fetchDates(
    `${shiftDays(period.start, -1)}T00:00:00Z`,
    `${shiftDays(period.end, 2)}T00:00:00Z`,
  );
  // Conflits calculés sur toutes les dates visibles de la période, avant les filtres d'affichage.
  const conflicts = markConflicts(all);
  let team: Set<string> | null = null;
  if (filters.mine && user) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("matter_team").select("matter_id").eq("user_id", user.id);
    team = new Set((data ?? []).map((m) => m.matter_id));
  }
  const items = all
    .filter((i) => i.localDay >= period.start && i.localDay <= period.end)
    .filter(
      (i) =>
        (filters.status === "all" ||
          (filters.status === "to_confirm"
            ? i.status === "scheduled"
            : i.status !== "cancelled" && i.status !== "adjourned")) &&
        (!filters.office || i.officeId === filters.office) &&
        (!filters.lawyer || i.attendeeIds.includes(filters.lawyer)) &&
        (!filters.court || i.courtId === filters.court) &&
        (!filters.kind || i.kind === filters.kind) &&
        (!team || team.has(i.matterId) || (user ? i.attendeeIds.includes(user.id) : false)),
    )
    .map((i) => ({ ...i, conflict: conflicts.has(i.id) }));
  return {
    items,
    period,
    anchor,
    truncated: all.length >= LIMIT,
    scope: (await seesWholeFirm(role, user?.id)) ? "firm" : "teams",
  };
}

/** Accueil et « À surveiller » : dates de cour des 14 prochains jours, à confirmer, et conflits. */
export async function getCourtWatch() {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return null;
  const today = todayIn();
  const items = await fetchDates(`${shiftDays(today, -1)}T00:00:00Z`, `${shiftDays(today, 16)}T00:00:00Z`);
  const conflicts = markConflicts(items);
  const active = items
    .filter(
      (i) =>
        (i.status === "scheduled" || i.status === "confirmed") &&
        i.localDay >= today &&
        i.localDay <= shiftDays(today, 13),
    )
    .map((i) => ({ ...i, conflict: conflicts.has(i.id) }));
  return {
    upcoming: active,
    toConfirm: active.filter((i) => i.status === "scheduled"),
    conflicts: active.filter((i) => i.conflict),
  };
}
