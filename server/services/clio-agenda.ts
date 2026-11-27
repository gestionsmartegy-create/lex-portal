import "server-only";
import { z } from "zod";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getClioGateway } from "@/server/providers";
import { ClioError } from "@/server/providers/clio/gateway";
import type { ClioMatterCalendarEntry } from "@/server/providers/clio/schemas";
import type { CourtDateKind } from "@/server/services/court-dates";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";
import { timezones } from "@/server/services/offices";

/**
 * Dates de cour venues de Clio (ADR 0038, E8 et E16). Lecture de l'agenda d'un dossier (Calendar
 * Entries, lecture), puis import : la date arrive « à confirmer », déjà liée à son entrée Clio, et n'est
 * jamais recréée dans Clio. Import automatique : seulement les entrées de type « Cour » / « Court »
 * (décision du 2026-10-28) ; les autres restent importables à la main.
 */
const KIND_RULES: [RegExp, CourtDateKind][] = [
  [/proc[eè]s|trial/i, "trial"],
  [/requ[eê]te|motion/i, "motion"],
  [/conf[eé]rence|conference|case management/i, "case_conference"],
  [/comparution|appearance/i, "appearance"],
  [/date limite|d[eé]p[oô]t|deadline|filing/i, "filing_deadline"],
  [/audience|hearing|cour\b|court|tribunal/i, "hearing"],
];

/** Sorte de date de cour devinée d'après le type et le titre de l'entrée ; null si ce n'en est pas une. */
export function courtKindOf(
  entry: Pick<ClioMatterCalendarEntry, "summary" | "eventType">,
): CourtDateKind | null {
  const text = `${entry.eventType ?? ""} ${entry.summary}`;
  for (const [re, kind] of KIND_RULES) if (re.test(text)) return kind;
  return null;
}

/**
 * Import AUTOMATIQUE (décision du 2026-10-28) : seulement les rendez-vous dont le type d'événement
 * Clio est « Cour » / « Court ». Les autres restent importables à la main (bouton « Importer »).
 */
export function isCourtEvent(entry: Pick<ClioMatterCalendarEntry, "eventType">): boolean {
  return /\b(cour|court)s?\b/i.test(entry.eventType ?? "");
}

const zoneOf = (tz: string | null | undefined) =>
  tz && (timezones as readonly string[]).includes(tz) ? tz : DEFAULT_TIMEZONE;

/** Agenda Clio d'un dossier, pour l'onglet « Cour » (équipe du dossier ; accès vérifié d'abord). */
export async function listClioEntriesForMatter(matterId: string) {
  if (!z.uuid().safeParse(matterId).success || !(await assertStaffMatterAccess(matterId))) return null;
  const supabase = await createSupabaseServerClient();
  // Identifiant Clio : lu par une fonction qui revérifie l'accès (colonne non lisible par l'API).
  const { data: clioId } = await supabase.rpc("matter_clio_id", { p_matter: matterId });
  const matter = { clio_matter_id: (clioId as string | null) ?? null };
  if (!matter.clio_matter_id || !/^\d{1,15}$/.test(matter.clio_matter_id))
    return { linked: false as const, entries: [] };
  let entries: ClioMatterCalendarEntry[];
  try {
    entries = await getClioGateway().listMatterCalendarEntries(Number(matter.clio_matter_id), null);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "clio_agenda_read_failed",
        code: e instanceof ClioError ? e.code : "UPSTREAM",
      }),
    );
    return { linked: true as const, entries: [], unavailable: true };
  }
  const ids = entries.map((e) => e.id);
  const { data: imported } = ids.length
    ? await supabase
        .from("court_dates")
        .select("clio_calendar_entry_id, source")
        .in("clio_calendar_entry_id", ids)
    : { data: [] as { clio_calendar_entry_id: string | null; source: string }[] };
  const known = new Set((imported ?? []).map((r) => r.clio_calendar_entry_id));
  // Entrées écrites par la plateforme elle-même (dates saisies dans le portail) : déjà affichées dans
  // « Dates de cour à venir », on ne les repropose pas ici.
  const ours = new Set(
    (imported ?? []).filter((r) => r.source === "portal").map((r) => r.clio_calendar_entry_id),
  );
  const soon = Date.now() - 86_400_000;
  return {
    linked: true as const,
    entries: entries
      .filter((e) => Date.parse(e.startAt) >= soon && !ours.has(e.id))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 50)
      .map((e) => ({ ...e, imported: known.has(e.id), suggestedKind: courtKindOf(e) })),
  };
}

export const importEntrySchema = z.object({
  matterId: z.uuid(),
  entryId: z.string().regex(/^\d{1,20}$/),
  kind: z.enum(["trial", "hearing", "motion", "case_conference", "appearance", "filing_deadline"]),
});

/** Import à la main (bouton « Importer ») : l'entrée est relue dans Clio, jamais crue telle que reçue. */
export async function importClioEntry(input: z.infer<typeof importEntrySchema>) {
  const listed = await listClioEntriesForMatter(input.matterId);
  const entry = listed?.entries.find((e) => e.id === input.entryId);
  if (!entry || entry.imported) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { data: tz } = await supabase
    .from("matters")
    .select("offices(timezone)")
    .eq("id", input.matterId)
    .maybeSingle();
  const { data: created, error } = await supabase.rpc("court_date_import_clio", {
    p_matter: input.matterId,
    p_entry_id: entry.id,
    p_kind: input.kind,
    p_starts_at: entry.startAt,
    p_ends_at: entry.endAt as unknown as string,
    p_all_day: entry.allDay,
    p_timezone: zoneOf((tz?.offices as unknown as { timezone: string } | null)?.timezone),
  });
  // null : déjà importée (par exemple dans un autre dossier) — rien n'a été créé.
  return { ok: !error && Boolean(created) };
}

/**
 * Planificateur : relit l'agenda Clio des dossiers liés (les plus anciens d'abord, 20 par passage) et
 * importe les rendez-vous de type « Cour » / « Court » (décision du 2026-10-28). service_role :
 * synchronisation (usage permis). Jamais avec le faux Clio : il inventerait des audiences (AGENTS.md §2.7).
 */
export async function importClioCourtDates(limit = 20) {
  const admin = createSupabaseServiceClient();
  const { data: matters, error } = await admin.rpc("clio_agenda_next", { p_limit: limit });
  if (error) {
    console.error(JSON.stringify({ event: "clio_agenda_next_failed", code: error.code }));
    return { matters: 0, imported: 0 };
  }
  const gateway = getClioGateway();
  if (gateway.isMock) return { matters: 0, imported: 0, mock: true };
  let imported = 0;
  let read = 0;
  for (const m of matters ?? []) {
    if (!/^\d{1,15}$/.test(m.clio_matter_id ?? "")) continue;
    const startedAt = new Date().toISOString();
    // Chevauchement de 10 minutes : une entrée modifiée pendant le passage précédent n'est pas perdue.
    const since = m.since ? new Date(Date.parse(m.since) - 600_000).toISOString() : null;
    try {
      const entries = await gateway.listMatterCalendarEntries(Number(m.clio_matter_id), since);
      for (const e of entries) {
        if (!isCourtEvent(e) || Date.parse(e.startAt) < Date.now() - 86_400_000) continue;
        const kind = courtKindOf(e) ?? "hearing";
        const { data: id } = await admin.rpc("court_date_import_clio", {
          p_matter: m.matter_id,
          p_entry_id: e.id,
          p_kind: kind,
          p_starts_at: e.startAt,
          p_ends_at: e.endAt as unknown as string,
          p_all_day: e.allDay,
          p_timezone: zoneOf(m.office_timezone),
        });
        if (id) imported += 1;
      }
      await admin.rpc("clio_agenda_mark", { p_matter: m.matter_id, p_at: startedAt });
      read += 1;
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "clio_agenda_import_failed",
          matter_id: m.matter_id,
          code: e instanceof ClioError ? e.code : "UPSTREAM",
        }),
      );
    }
  }
  return { matters: read, imported };
}
