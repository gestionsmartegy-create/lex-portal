import "server-only";
import { z } from "zod";
import type { MatterStatus } from "@/types/domain";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertMatterAccess } from "@/server/services/access-control";

/**
 * Étiquettes et suivi de portefeuille (ADR 0021).
 * - Étiquettes : définies par le firm_admin (RLS matter_tags_admin_*), lues par le personnel.
 * - Pose et retrait sur un dossier : équipe du dossier ou firm_admin (RLS matter_tag_links_*),
 *   après `assertMatterAccess(…, "read_write")` et contrôle du rôle du personnel.
 * - Liste filtrée : lectures avec la session (RLS) ; le personnel ne voit que les dossiers de ses équipes.
 */
const uuid = z.uuid();
export const tagColors = ["marine", "gold", "red", "orange", "green", "blue", "purple", "gray"] as const;
export type TagColor = (typeof tagColors)[number];
export type MatterTag = {
  id: string;
  name_fr: string;
  name_en: string;
  color: TagColor;
  visible_to_client: boolean;
  position: number;
  is_active: boolean;
};
type Result = { ok: true } | { ok: false; code: "NOT_FOUND" | "FAILED" };
const fail = (code: "NOT_FOUND" | "FAILED" = "FAILED"): Result => ({ ok: false, code });

const TAG_COLUMNS = "id, name_fr, name_en, color, visible_to_client, position, is_active";

export async function listTags(opts: { activeOnly?: boolean } = {}): Promise<MatterTag[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("matter_tags").select(TAG_COLUMNS).order("position");
  if (opts.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as MatterTag[];
}

async function isAdmin() {
  return (await getSessionRole()) === "firm_admin";
}

export async function createTag(input: {
  nameFr: string;
  nameEn: string;
  color: TagColor;
  visible: boolean;
}): Promise<Result> {
  if (!(await isAdmin())) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from("matter_tags")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("matter_tags").insert({
    name_fr: input.nameFr,
    name_en: input.nameEn,
    color: input.color,
    visible_to_client: input.visible,
    position: (last?.position ?? 0) + 1,
  });
  return error ? fail() : { ok: true };
}

export async function updateTag(
  tagId: string,
  input: { nameFr: string; nameEn: string; color: TagColor; visible: boolean; active: boolean },
): Promise<Result> {
  if (!uuid.safeParse(tagId).success || !(await isAdmin())) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matter_tags")
    .update({
      name_fr: input.nameFr,
      name_en: input.nameEn,
      color: input.color,
      visible_to_client: input.visible,
      is_active: input.active,
    })
    .eq("id", tagId)
    .select("id");
  return error || !data?.length ? fail() : { ok: true };
}

/** Étiquettes d'un dossier : remplace l'ensemble (ajoute les nouvelles, retire les décochées). */
export async function setMatterTags(matterId: string, tagIds: string[]): Promise<Result> {
  if (!uuid.safeParse(matterId).success) return fail("NOT_FOUND");
  await assertMatterAccess(matterId, "read_write");
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const wanted = new Set(tagIds.filter((id) => uuid.safeParse(id).success));
  const { data: current } = await supabase
    .from("matter_tag_links")
    .select("tag_id")
    .eq("matter_id", matterId);
  const have = new Set((current ?? []).map((l) => l.tag_id));
  const toAdd = [...wanted].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !wanted.has(id));
  if (toAdd.length) {
    const { error } = await supabase
      .from("matter_tag_links")
      .insert(toAdd.map((tag_id) => ({ matter_id: matterId, tag_id })));
    if (error) {
      console.error(JSON.stringify({ event: "matter_tags_add_failed", code: error.code }));
      return fail();
    }
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from("matter_tag_links")
      .delete()
      .eq("matter_id", matterId)
      .in("tag_id", toRemove);
    if (error) return fail();
  }
  return { ok: true };
}

export async function getMatterTagIds(matterId: string): Promise<string[]> {
  if (!uuid.safeParse(matterId).success) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("matter_tag_links").select("tag_id").eq("matter_id", matterId);
  return (data ?? []).map((l) => l.tag_id);
}

// ---------------------------------------------------------------------------
// Liste de portefeuille filtrée
// ---------------------------------------------------------------------------
export const matterFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  tag: z.uuid().optional().catch(undefined),
  type: z.uuid().optional().catch(undefined),
  lawyer: z.uuid().optional().catch(undefined),
  status: z.enum(["open", "action_required", "on_hold", "closed"]).optional().catch(undefined),
  alert: z.enum(["overdue", "idle"]).optional().catch(undefined),
});
export type MatterFilters = z.infer<typeof matterFiltersSchema>;

export type PortfolioRow = {
  id: string;
  display_number: string | null;
  title: string;
  status: MatterStatus;
  progress_percent: number | null;
  matter_type_id: string | null;
  responsible_name: string | null;
  is_mock: boolean;
  tagIds: string[];
  teamIds: string[];
  pendingRequests: number;
  overdueRequests: number;
  lastActivity: string | null;
  updatedAt: string;
};

const IDLE_DAYS = 14;

export const PORTFOLIO_LIMIT = 300;

/** Date du jour à Halifax (fuseau par défaut du cabinet, AGENTS.md §5), au format AAAA-MM-JJ. */
function todayHalifax() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(new Date());
}

export async function listPortfolio(
  filters: MatterFilters,
  opts: { oldestFirst?: boolean } = {},
): Promise<{ rows: PortfolioRow[]; truncated: boolean }> {
  if (!(await getUser())) return { rows: [], truncated: false };
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matters")
    .select(
      "id, display_number, title, status, progress_percent, matter_type_id, responsible_name, is_mock, updated_at",
    )
    // Les plus anciens d'abord pour chercher les dossiers inactifs (sinon, les plus récents).
    .order("updated_at", { ascending: Boolean(opts.oldestFirst) })
    .limit(PORTFOLIO_LIMIT);
  if (filters.alert === "idle") query = query.neq("status", "closed");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("matter_type_id", filters.type);
  const { data: matters } = await query;
  const truncated = (matters ?? []).length >= PORTFOLIO_LIMIT;
  let rows = matters ?? [];
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (m) => m.title.toLowerCase().includes(q) || (m.display_number ?? "").toLowerCase().includes(q),
    );
  }
  const ids = rows.map((m) => m.id);
  if (!ids.length) return { rows: [], truncated };
  const [{ data: links }, { data: team }, { data: requests }, { data: steps }, { data: conversations }] =
    await Promise.all([
      supabase.from("matter_tag_links").select("matter_id, tag_id").in("matter_id", ids),
      supabase.from("matter_team").select("matter_id, user_id").in("matter_id", ids),
      supabase
        .from("document_requests")
        .select("matter_id, status, due_date, created_at")
        .in("matter_id", ids),
      supabase.from("matter_timeline_steps").select("matter_id, completed_at").in("matter_id", ids),
      supabase.from("conversations").select("matter_id, last_message_at").in("matter_id", ids),
    ]);
  const today = todayHalifax();
  const by = <T extends { matter_id: string | null }>(list: T[] | null, id: string) =>
    (list ?? []).filter((x) => x.matter_id === id);

  const result = rows.map((m): PortfolioRow => {
    const reqs = by(requests, m.id);
    const pending = reqs.filter((r) => r.status === "pending");
    const dates = [
      ...reqs.map((r) => r.created_at),
      ...by(steps, m.id).map((s) => s.completed_at),
      ...by(conversations, m.id).map((c) => c.last_message_at),
    ].filter((d): d is string => Boolean(d));
    return {
      id: m.id,
      display_number: m.display_number,
      title: m.title,
      status: m.status as MatterStatus,
      progress_percent: m.progress_percent,
      matter_type_id: m.matter_type_id,
      responsible_name: m.responsible_name,
      is_mock: m.is_mock,
      tagIds: by(links, m.id).map((l) => l.tag_id),
      teamIds: by(team, m.id).map((t) => t.user_id),
      pendingRequests: pending.length,
      overdueRequests: pending.filter((r) => r.due_date !== null && r.due_date < today).length,
      lastActivity: dates.length ? dates.sort().at(-1)! : null,
      updatedAt: m.updated_at,
    };
  });

  const idleBefore = new Date(Date.now() - IDLE_DAYS * 86_400_000).toISOString();
  const filtered = result.filter(
    (r) =>
      (!filters.tag || r.tagIds.includes(filters.tag)) &&
      (!filters.lawyer || r.teamIds.includes(filters.lawyer)) &&
      (filters.alert !== "overdue" || r.overdueRequests > 0) &&
      // « Inactif » : dossier non fermé sans activité depuis IDLE_DAYS jours.
      (filters.alert !== "idle" || (r.status !== "closed" && (r.lastActivity ?? r.updatedAt) < idleBefore)),
  );
  return { rows: filtered, truncated };
}
