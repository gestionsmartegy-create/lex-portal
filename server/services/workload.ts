import "server-only";
import { z } from "zod";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { markConflicts, todayIn } from "@/server/services/court-calendar";
import type { CourtDateStatus } from "@/server/services/court-dates";

/**
 * Charge de travail (ADR 0029, lot 6) : firm_admin seulement. Lecture sous la session (RLS : le
 * firm_admin voit tout), agrégats calculés en mémoire, aucun contenu de dossier (compteurs seulement).
 */
export const workloadFiltersSchema = z.object({
  days: z.enum(["30", "90"]).catch("30"),
  office: z.uuid().optional().catch(undefined),
});
export type WorkloadFilters = z.infer<typeof workloadFiltersSchema>;

export type LawyerLoad = {
  id: string;
  name: string;
  primaryOfficeId: string | null;
  openMatters: number;
  responsibleMatters: number;
  courtDates: number;
  conflicts: number;
  deliverables: number;
};
export type CountRow = { id: string | null; count: number; courtDates?: number };

const LIMIT = 2000;

type MatterRow = { id: string; office_id: string | null; matter_type_id: string | null };
type TeamRow = { matter_id: string; user_id: string; role: string };
type CourtRow = {
  id: string;
  matter_id: string;
  court_id: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: CourtDateStatus;
  court_date_attendees: { user_id: string }[];
};
type DeliverableRow = { matter_id: string; owner_id: string | null };

/** Agrégation pure (testée à part) : par avocat, bureau, tribunal et domaine. */
export function aggregateWorkload(input: {
  staff: { id: string; name: string; primaryOfficeId: string | null }[];
  matters: MatterRow[];
  team: TeamRow[];
  courtDates: CourtRow[];
  deliverables: DeliverableRow[];
  office?: string;
}) {
  const matters = input.office ? input.matters.filter((m) => m.office_id === input.office) : input.matters;
  const matterIds = new Set(matters.map((m) => m.id));
  const team = input.team.filter((t) => matterIds.has(t.matter_id));
  const courts = input.courtDates.filter(
    (c) => matterIds.has(c.matter_id) && c.status !== "cancelled" && c.status !== "adjourned",
  );
  const conflicts = markConflicts(
    courts.map((c) => ({
      id: c.id,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      allDay: c.all_day,
      status: c.status,
      courtId: c.court_id,
      attendeeIds: c.court_date_attendees.map((a) => a.user_id),
    })),
  );
  const deliverables = input.deliverables.filter((d) => matterIds.has(d.matter_id));

  const lawyers: LawyerLoad[] = input.staff
    .map((p) => {
      const mine = team.filter((t) => t.user_id === p.id);
      const myCourts = courts.filter((c) => c.court_date_attendees.some((a) => a.user_id === p.id));
      return {
        id: p.id,
        name: p.name,
        primaryOfficeId: p.primaryOfficeId,
        openMatters: new Set(mine.map((t) => t.matter_id)).size,
        responsibleMatters: mine.filter((t) => t.role === "responsible").length,
        courtDates: myCourts.length,
        conflicts: myCourts.filter((c) => conflicts.has(c.id)).length,
        deliverables: deliverables.filter((d) => d.owner_id === p.id).length,
      };
    })
    .filter((l) => l.openMatters || l.courtDates || l.deliverables)
    .sort(
      (a, b) => b.courtDates - a.courtDates || b.openMatters - a.openMatters || a.name.localeCompare(b.name),
    );

  const count = <T>(rows: T[], key: (r: T) => string | null) => {
    const map = new Map<string | null, number>();
    for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + 1);
    return map;
  };
  const officeMatters = count(matters, (m) => m.office_id);
  const officeCourts = count(courts, (c) => matters.find((m) => m.id === c.matter_id)?.office_id ?? null);
  const offices: CountRow[] = [...new Set([...officeMatters.keys(), ...officeCourts.keys()])]
    .map((id) => ({ id, count: officeMatters.get(id) ?? 0, courtDates: officeCourts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const byCourt: CountRow[] = [...count(courts, (c) => c.court_id).entries()]
    .map(([id, n]) => ({ id, count: n }))
    .sort((a, b) => b.count - a.count);
  const byType: CountRow[] = [...count(matters, (m) => m.matter_type_id).entries()]
    .map(([id, n]) => ({ id, count: n }))
    .sort((a, b) => b.count - a.count);
  return {
    lawyers,
    offices,
    byCourt,
    byType,
    totals: { matters: matters.length, courtDates: courts.length, conflicts: conflicts.size },
  };
}

export async function getWorkload(filters: WorkloadFilters) {
  if ((await getSessionRole()) !== "firm_admin") return null;
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const until = new Date(now.getTime() + Number(filters.days) * 86_400_000);
  // Échéances des livrables (colonne date) : jour courant à Halifax, fuseau par défaut du cabinet.
  const today = todayIn();
  const lastDay = todayIn("America/Halifax", until);
  const [
    { data: matters },
    { data: team },
    { data: courtDates },
    { data: deliverables },
    { data: staff },
    { data: primaries },
  ] = await Promise.all([
    supabase.from("matters").select("id, office_id, matter_type_id").neq("status", "closed").limit(LIMIT),
    supabase
      .from("matter_team")
      .select("matter_id, user_id, role")
      .limit(LIMIT * 3),
    supabase
      .from("court_dates")
      .select("id, matter_id, court_id, starts_at, ends_at, all_day, status, court_date_attendees(user_id)")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", until.toISOString())
      .limit(LIMIT),
    supabase
      .from("matter_deliverables")
      .select("matter_id, owner_id")
      .in("status", ["planned", "in_progress"])
      .gte("due_date", today)
      .lte("due_date", lastDay)
      .limit(LIMIT),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .limit(500),
    supabase.from("staff_offices").select("user_id, office_id").eq("is_primary", true).limit(500),
  ]);
  const primary = new Map((primaries ?? []).map((p) => [p.user_id, p.office_id]));
  const result = aggregateWorkload({
    staff: (staff ?? []).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
      primaryOfficeId: primary.get(p.id) ?? null,
    })),
    matters: (matters ?? []) as MatterRow[],
    team: (team ?? []) as TeamRow[],
    courtDates: (courtDates ?? []) as unknown as CourtRow[],
    deliverables: (deliverables ?? []) as DeliverableRow[],
    office: filters.office,
  });
  const truncated =
    [matters, courtDates, deliverables].some((rows) => (rows ?? []).length >= LIMIT) ||
    (team ?? []).length >= LIMIT * 3;
  return { ...result, truncated };
}
