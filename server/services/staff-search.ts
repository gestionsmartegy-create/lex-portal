import "server-only";
import { sanitizeSearch } from "@/lib/search-query";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getCourtWatch } from "@/server/services/court-calendar";
import { getWatchlist } from "@/server/services/matter-board";
import { countStaffUnread } from "@/server/services/messaging";

/**
 * Recherche globale et alertes de l'espace cabinet (lot « Expérience utilisateur », ADR 0033).
 * Tout est lu sous la session de l'utilisateur (RLS) : on ne trouve que ses dossiers et contrats
 * (tout le cabinet pour le firm_admin). Aucun service_role.
 */
export type SearchHit = { id: string; label: string; detail: string | null; href: string };
export type SearchResults = {
  matters: SearchHit[];
  contracts: SearchHit[];
  clients: SearchHit[];
  /** Trop de recherches : réessayer dans quelques minutes. */
  limited?: boolean;
};

export async function searchStaff(raw: string): Promise<SearchResults> {
  const empty = { matters: [], contracts: [], clients: [] };
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return empty;
  const q = sanitizeSearch(raw);
  if (!q) return empty;
  const supabase = await createSupabaseServerClient();
  const [{ data: matters }, { data: contracts }, { data: clients }] = await Promise.all([
    supabase
      .from("matters")
      .select("id, display_number, title")
      .or(`title.ilike.%${q}%,display_number.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("contracts")
      .select("id, title, client_name")
      .or(`title.ilike.%${q}%,client_name.ilike.%${q}%`)
      .eq("template_draft", false)
      .order("updated_at", { ascending: false })
      .limit(6),
    role === "firm_admin"
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .eq("role", "client")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(6)
      : Promise.resolve({
          data: [] as { id: string; first_name: string | null; last_name: string | null; email: string }[],
        }),
  ]);
  return {
    matters: (matters ?? []).map((m) => ({
      id: m.id,
      label: m.title,
      detail: m.display_number,
      href: `/admin/matters/${m.id}`,
    })),
    contracts: (contracts ?? []).map((c) => ({
      id: c.id,
      label: c.title,
      detail: c.client_name,
      href: `/admin/contracts/${c.id}`,
    })),
    clients: (clients ?? []).map((c) => ({
      id: c.id,
      label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
      detail: c.email,
      href: "/admin/clients",
    })),
  };
}

export type StaffAlert = {
  key: "unreadMessages" | "toConfirm" | "conflicts" | "clioChanges" | "overdueRequests" | "lateDeliverables";
  count: number;
  href: string;
};

/** Cloche du cabinet : ce qui demande une action, avec un lien vers l'endroit où agir. */
export async function getStaffAlerts(): Promise<{ alerts: StaffAlert[]; unread: number }> {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return { alerts: [], unread: 0 };
  const [unread, court, watch] = await Promise.all([countStaffUnread(), getCourtWatch(), getWatchlist()]);
  const all: StaffAlert[] = [
    { key: "unreadMessages", count: unread, href: "/admin/messages?filter=unread" },
    {
      key: "toConfirm",
      count: court?.toConfirm.length ?? 0,
      href: "/admin/court-calendar?view=list&status=to_confirm",
    },
    { key: "conflicts", count: court?.conflicts.length ?? 0, href: "/admin/court-calendar?view=list" },
    { key: "clioChanges", count: court?.clioChanges.length ?? 0, href: "/admin" },
    {
      key: "overdueRequests",
      count: watch?.overdueRequests.total ?? 0,
      href: "/admin/requests?status=overdue",
    },
    { key: "lateDeliverables", count: watch?.lateDeliverables.total ?? 0, href: "/admin" },
  ];
  return { alerts: all.filter((a) => a.count > 0), unread };
}
