import "server-only";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { listAuditEvents } from "@/server/services/admin";
import { listContracts } from "@/server/services/contracts";
import { getCourtWatch } from "@/server/services/court-calendar";
import { getWatchlist } from "@/server/services/matter-board";
import { listStaffConversations } from "@/server/services/messaging";

/**
 * « Ma journée » (accueil de l'espace cabinet, ADR 0033) : ce qui attend la personne aujourd'hui,
 * chaque ligne menant à l'endroit où agir. Tout est lu sous sa session (RLS) : ses dossiers et ses
 * équipes, tout le cabinet pour le firm_admin. L'activité récente (journal) : firm_admin seulement.
 */
const RECENT_DOCS_DAYS = 7;

export type ActivityItem = {
  id: string;
  action: string;
  actor: string | null;
  matterNumber: string | null;
  matterId: string | null;
  at: string;
};

export async function getMyDay() {
  const role = await getSessionRole();
  const user = await getUser();
  if ((role !== "staff" && role !== "firm_admin") || !user) return null;
  const isAdmin = role === "firm_admin";
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - RECENT_DOCS_DAYS * 86_400_000).toISOString();

  const [court, watch, unread, documents, inReview, events] = await Promise.all([
    getCourtWatch(),
    getWatchlist(),
    listStaffConversations({ unreadOnly: true }),
    supabase
      .from("documents")
      .select("id, matter_id, display_name, uploaded_at, matters(display_number)")
      .eq("folder", "client_upload")
      .gte("uploaded_at", since)
      .order("uploaded_at", { ascending: false })
      .limit(5),
    listContracts({ status: "in_review" }),
    isAdmin ? listAuditEvents({ limit: 8 }) : Promise.resolve([]),
  ]);

  // Activité : noms du personnel et numéros de dossier (visibles sous RLS), jamais le contenu.
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter((x): x is string => Boolean(x)))];
  const matterIds = [...new Set(events.map((e) => e.matter_id).filter((x): x is string => Boolean(x)))];
  const [{ data: actors }, { data: matters }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, title, first_name, last_name, email").in("id", actorIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            title: string | null;
            first_name: string | null;
            last_name: string | null;
            email: string;
          }[],
        }),
    matterIds.length
      ? supabase.from("matters").select("id, display_number").in("id", matterIds)
      : Promise.resolve({ data: [] as { id: string; display_number: string | null }[] }),
  ]);
  const actorName = new Map(
    (actors ?? []).map((p) => [
      p.id,
      [p.title, p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
    ]),
  );
  const matterNumber = new Map((matters ?? []).map((m) => [m.id, m.display_number]));

  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();
  return {
    isAdmin,
    upcoming: court?.upcoming ?? [],
    thisWeek: (court?.upcoming ?? []).filter((i) => i.startsAt < weekEnd).length,
    toConfirm: court?.toConfirm.length ?? 0,
    conflicts: court?.conflicts.length ?? 0,
    clioChanges: court?.clioChanges ?? [],
    unread: unread.slice(0, 4),
    unreadTotal: unread.length,
    documents: (documents.data ?? []).map((d) => ({
      id: d.id,
      matterId: d.matter_id,
      name: d.display_name,
      at: d.uploaded_at,
      matterNumber:
        (d.matters as unknown as { display_number: string | null } | null)?.display_number ?? null,
    })),
    late: [
      ...(watch?.overdueRequests.items ?? []).map((i) => ({ ...i, kind: "request" as const })),
      ...(watch?.lateDeliverables.items ?? []).map((i) => ({ ...i, kind: "deliverable" as const })),
    ].slice(0, 5),
    lateTotal: (watch?.overdueRequests.total ?? 0) + (watch?.lateDeliverables.total ?? 0),
    contracts: (inReview ?? []).slice(0, 3),
    watch,
    activity: events.map((e): ActivityItem => ({
      id: String(e.id),
      action: e.action,
      actor: e.actor_id ? (actorName.get(e.actor_id) ?? null) : null,
      matterNumber: e.matter_id ? (matterNumber.get(e.matter_id) ?? null) : null,
      matterId: e.matter_id,
      at: e.occurred_at,
    })),
  };
}
