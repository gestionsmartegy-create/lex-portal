import "server-only";
import type { MatterStatus } from "@/types/domain";
import { assertMatterAccess } from "@/server/services/access-control";
import { createSupabaseServerClient } from "@/server/db/server-client";

/** Colonnes lisibles par l'API utilisateur (ADR 0009) — jamais de select("*"). */
const MATTER_COLUMNS =
  "id, display_number, title, description, practice_area, status, progress_percent, responsible_name, opened_at, closed_at, is_mock, last_synced_at, updated_at";

export type MatterSummary = {
  id: string;
  display_number: string | null;
  title: string;
  description: string | null;
  practice_area: string | null;
  status: MatterStatus;
  progress_percent: number | null;
  responsible_name: string | null;
  opened_at: string | null;
  closed_at: string | null;
  is_mock: boolean;
  last_synced_at: string | null;
  updated_at: string;
};

export type MatterFilter = "all" | "active" | "closed";

/** Dossiers visibles (RLS) — lecture du cache synchronisé depuis Clio. */
export async function listMatters(filter: MatterFilter = "all"): Promise<MatterSummary[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("matters").select(MATTER_COLUMNS).order("updated_at", { ascending: false });
  if (filter === "active") query = query.neq("status", "closed");
  if (filter === "closed") query = query.eq("status", "closed");
  const { data } = await query;
  return (data ?? []) as MatterSummary[];
}

export async function getMatterDetail(matterId: string) {
  const access = await assertMatterAccess(matterId);
  const supabase = await createSupabaseServerClient();
  const [{ data: matter }, { data: steps }] = await Promise.all([
    supabase.from("matters").select(MATTER_COLUMNS).eq("id", matterId).single(),
    supabase
      .from("matter_timeline_steps")
      .select("id, position, title, description, is_completed, completed_at")
      .eq("matter_id", matterId)
      .order("position"),
  ]);
  return { matter: matter as MatterSummary, timeline: steps ?? [], accessLevel: access.accessLevel };
}

/** Un dossier « demande une action » : signature en attente ou pièce demandée. */
export async function mattersRequiringAction(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const [{ data: signatures }, { data: requests }] = await Promise.all([
    supabase.from("signature_requests").select("matter_id").in("status", ["sent", "viewed"]),
    supabase.from("document_requests").select("matter_id").eq("status", "pending"),
  ]);
  return new Set([...(signatures ?? []), ...(requests ?? [])].map((r) => r.matter_id));
}
