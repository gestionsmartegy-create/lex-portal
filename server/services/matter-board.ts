import "server-only";
import { z } from "zod";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import {
  listPortfolio,
  matterFiltersSchema,
  type MatterFilters,
  type PortfolioRow,
} from "@/server/services/matter-tags";
import { getMatterTypeTemplate } from "@/server/services/matter-templates";

/**
 * Suivi de portefeuille (ADR 0023, plan phase 2) : Kanban par étape, panneau « À surveiller »,
 * vues enregistrées. Lectures avec la session (RLS : dossiers de ses équipes, tous pour le firm_admin).
 */
async function isStaff() {
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}

function todayHalifax() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(new Date());
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Kanban : une colonne par étape du modèle du type de dossier.
// ---------------------------------------------------------------------------------------------
export type BoardCard = PortfolioRow & { currentStep: string | null; currentStepEn: string | null };
export type BoardColumn = {
  key: string;
  kind: "step" | "notStarted" | "other" | "done";
  title_fr: string | null;
  title_en: string | null;
  cards: BoardCard[];
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function getMatterBoard(
  typeId: string,
  filters: MatterFilters,
): Promise<{ columns: BoardColumn[]; truncated: boolean } | null> {
  if (!(await isStaff())) return null;
  const template = await getMatterTypeTemplate(typeId);
  if (!template) return null;
  const { rows, truncated } = await listPortfolio({ ...filters, type: typeId });
  const supabase = await createSupabaseServerClient();
  const ids = rows.map((r) => r.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("matter_timeline_steps")
        .select("matter_id, position, title, title_en, is_completed")
        .in("matter_id", ids)
        .order("position")
    : { data: [] };

  const columns: BoardColumn[] = [
    { key: "notStarted", kind: "notStarted", title_fr: null, title_en: null, cards: [] },
    ...template.steps.map((s): BoardColumn => ({
      key: s.id,
      kind: "step",
      title_fr: s.title_fr,
      title_en: s.title_en,
      cards: [],
    })),
    { key: "other", kind: "other", title_fr: null, title_en: null, cards: [] },
    { key: "done", kind: "done", title_fr: null, title_en: null, cards: [] },
  ];
  const byKey = new Map(columns.map((c) => [c.key, c]));

  for (const row of rows) {
    const own = (steps ?? []).filter((s) => s.matter_id === row.id);
    const current = own.find((s) => !s.is_completed);
    const card: BoardCard = {
      ...row,
      currentStep: current ? current.title : null,
      currentStepEn: current ? current.title_en : null,
    };
    if (!own.length) byKey.get("notStarted")!.cards.push(card);
    else if (!current) byKey.get("done")!.cards.push(card);
    else {
      // L'étape en cours est rattachée à l'étape du modèle de même titre (FR ou EN).
      const match = template.steps.find(
        (t) =>
          norm(t.title_fr) === norm(current.title) ||
          norm(t.title_en) === norm(current.title) ||
          (current.title_en !== null && norm(t.title_en) === norm(current.title_en)),
      );
      byKey.get(match ? match.id : "other")!.cards.push(card);
    }
  }
  // Colonnes techniques vides masquées ; les étapes du modèle restent toujours visibles.
  return {
    columns: columns.filter((c) => c.kind === "step" || c.cards.length > 0),
    truncated,
  };
}

// ---------------------------------------------------------------------------------------------
// « À surveiller » : demandes en retard ou proches, livrables en retard ou proches, dossiers inactifs.
// ---------------------------------------------------------------------------------------------
export const WATCH_SOON_DAYS = 7;
const WATCH_LIMIT = 8;

export type WatchItem = {
  id: string;
  matterId: string;
  matterNumber: string | null;
  matterTitle: string;
  title: string;
  title_en: string | null;
  date: string | null;
};
export type Watchlist = {
  overdueRequests: { total: number; items: WatchItem[] };
  soonRequests: { total: number; items: WatchItem[] };
  lateDeliverables: { total: number; items: WatchItem[] };
  soonDeliverables: { total: number; items: WatchItem[] };
  idleMatters: { total: number; items: WatchItem[] };
};

type MatterRef = { display_number: string | null; title: string } | null;

export async function getWatchlist(): Promise<Watchlist | null> {
  if (!(await isStaff())) return null;
  const supabase = await createSupabaseServerClient();
  const today = todayHalifax();
  const soon = addDays(today, WATCH_SOON_DAYS);
  const [{ data: requests }, { data: deliverables }, idle] = await Promise.all([
    supabase
      .from("document_requests")
      .select("id, matter_id, title, title_en, due_date, matters(display_number, title, status)")
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lte("due_date", soon)
      .order("due_date")
      .limit(500),
    supabase
      .from("matter_deliverables")
      .select("id, matter_id, title, due_date, matters(display_number, title, status)")
      .in("status", ["planned", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", soon)
      .order("due_date")
      .limit(500),
    listPortfolio({ alert: "idle" }, { oldestFirst: true }),
  ]);

  const toItem = (r: {
    id: string;
    matter_id: string;
    title: string;
    title_en?: string | null;
    due_date: string | null;
    matters: unknown;
  }): WatchItem => {
    const m = r.matters as MatterRef;
    return {
      id: r.id,
      matterId: r.matter_id,
      matterNumber: m?.display_number ?? null,
      matterTitle: m?.title ?? "",
      title: r.title,
      title_en: r.title_en ?? null,
      date: r.due_date,
    };
  };
  // Les dossiers fermés ne déclenchent pas d'alerte.
  const openOnly = <T extends { matters: unknown }>(list: T[] | null) =>
    (list ?? []).filter((x) => (x.matters as { status?: string } | null)?.status !== "closed");
  const group = (items: WatchItem[]) => ({ total: items.length, items: items.slice(0, WATCH_LIMIT) });

  const reqs = openOnly(requests).map(toItem);
  const dels = openOnly(deliverables).map(toItem);
  // Inactifs : les plus anciens d'abord.
  const idleRows = [...idle.rows].sort((a, b) =>
    (a.lastActivity ?? a.updatedAt).localeCompare(b.lastActivity ?? b.updatedAt),
  );
  return {
    overdueRequests: group(reqs.filter((r) => r.date! < today)),
    soonRequests: group(reqs.filter((r) => r.date! >= today)),
    lateDeliverables: group(dels.filter((d) => d.date! < today)),
    soonDeliverables: group(dels.filter((d) => d.date! >= today)),
    idleMatters: group(
      idleRows.map((m) => ({
        id: m.id,
        matterId: m.id,
        matterNumber: m.display_number,
        matterTitle: m.title,
        title: m.title,
        title_en: null,
        date: m.lastActivity ?? m.updatedAt,
      })),
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Vues enregistrées : filtres du portefeuille, revalidés et remis sous forme canonique.
// ---------------------------------------------------------------------------------------------
export const viewModeSchema = z.enum(["list", "board"]).catch("list");
export const MAX_SAVED_VIEWS = 20;

/** Chaîne de requête canonique : seuls les filtres connus et valides, plus le mode d'affichage. */
export function canonicalViewQuery(input: Record<string, unknown>): string {
  const filters = matterFiltersSchema.parse({
    q: input.q || undefined,
    tag: input.tag || undefined,
    type: input.type || undefined,
    lawyer: input.lawyer || undefined,
    office: input.office || undefined,
    status: input.status || undefined,
    alert: input.alert || undefined,
  });
  const params = new URLSearchParams();
  for (const key of ["q", "tag", "type", "lawyer", "office", "status", "alert"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (viewModeSchema.parse(input.view) === "board") params.set("view", "board");
  // « * » n'est pas encodé par URLSearchParams : on l'encode pour rester dans le jeu permis en base.
  return params.toString().replaceAll("*", "%2A");
}

export type SavedView = { id: string; name: string; query: string };

export async function listSavedViews(): Promise<SavedView[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("matter_saved_views")
    .select("id, name, query")
    .order("created_at")
    .limit(MAX_SAVED_VIEWS);
  return data ?? [];
}

type Result = { ok: true } | { ok: false; code: "FAILED" | "DUPLICATE" | "LIMIT" };

export async function saveView(name: string, query: Record<string, unknown>): Promise<Result> {
  if (!(await isStaff()) || !(await getUser())) return { ok: false, code: "FAILED" };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("matter_saved_views").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_SAVED_VIEWS) return { ok: false, code: "LIMIT" };
  const { error } = await supabase
    .from("matter_saved_views")
    .insert({ name: name.trim(), query: canonicalViewQuery(query) });
  if (error)
    return {
      ok: false,
      code: error.code === "23505" ? "DUPLICATE" : error.code === "P0001" ? "LIMIT" : "FAILED",
    };
  return { ok: true };
}

export async function removeView(id: string): Promise<Result> {
  if (!(await isStaff()) || !z.uuid().safeParse(id).success) return { ok: false, code: "FAILED" };
  const supabase = await createSupabaseServerClient();
  // RLS : seule une vue de l'utilisateur peut être retirée.
  const { error } = await supabase.from("matter_saved_views").delete().eq("id", id);
  return error ? { ok: false, code: "FAILED" } : { ok: true };
}
