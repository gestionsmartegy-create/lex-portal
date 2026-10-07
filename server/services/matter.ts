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

/**
 * Détail d'un dossier pour le client. Étapes affichées dans sa langue quand elles viennent d'un
 * modèle (title_en) ; informations du dossier : la RLS ne renvoie que les champs visibles (ADR 0019).
 */
export async function getMatterDetail(matterId: string, locale = "en") {
  const access = await assertMatterAccess(matterId);
  const supabase = await createSupabaseServerClient();
  const [{ data: matter }, { data: steps }, { data: values }] = await Promise.all([
    supabase.from("matters").select(MATTER_COLUMNS).eq("id", matterId).single(),
    supabase
      .from("matter_timeline_steps")
      .select("id, position, title, title_en, description, description_en, is_completed, completed_at")
      .eq("matter_id", matterId)
      .order("position"),
    supabase
      .from("matter_field_values")
      .select("value, matter_type_fields(label_fr, label_en, kind, position)")
      .eq("matter_id", matterId),
  ]);
  const en = locale === "en";
  const timeline = (steps ?? []).map(({ title_en, description_en, ...s }) => ({
    ...s,
    title: en && title_en ? title_en : s.title,
    description: en && title_en ? description_en : s.description,
  }));
  const fields = (values ?? [])
    .map((v) => {
      const f = v.matter_type_fields as unknown as {
        label_fr: string;
        label_en: string;
        kind: "text" | "date" | "number";
        position: number;
      } | null;
      return f
        ? { label: en ? f.label_en : f.label_fr, kind: f.kind, position: f.position, value: v.value }
        : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => a.position - b.position);
  return { matter: matter as MatterSummary, timeline, fields, accessLevel: access.accessLevel };
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
