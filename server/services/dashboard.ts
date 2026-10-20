import "server-only";
import type { Money } from "@/types/domain";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { countUnreadNotifications } from "@/server/services/notification";
import { listMyContracts } from "@/server/services/client-contracts";

export type DashboardCounts = {
  activeMatters: number;
  pendingDocuments: number;
  unreadMessages: number;
  outstandingBalance: Money;
  dueInvoices: number;
  unreadNotifications: number;
};

/** Indicateurs du tableau de bord et pastilles de navigation (RPC client_dashboard_counts, RLS). */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const supabase = await createSupabaseServerClient();
  const [{ data: counts }, { count: dueInvoices }, unreadNotifications] = await Promise.all([
    supabase
      .rpc("client_dashboard_counts")
      .select("active_matters, pending_documents, unread_messages, outstanding_balance::text")
      .maybeSingle(),
    supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["due", "overdue"]),
    countUnreadNotifications(),
  ]);
  const row = counts as unknown as {
    active_matters: number;
    pending_documents: number;
    unread_messages: number;
    outstanding_balance: string | null;
  } | null;
  return {
    activeMatters: Number(row?.active_matters ?? 0),
    pendingDocuments: Number(row?.pending_documents ?? 0),
    unreadMessages: Number(row?.unread_messages ?? 0),
    outstandingBalance: (row?.outstanding_balance ?? "0.00") as Money,
    dueInvoices: dueInvoices ?? 0,
    unreadNotifications,
  };
}

export type ActionRequired =
  | { kind: "signature"; title: string; dueAt: string | null; href: string }
  | { kind: "request"; title: string; dueAt: string | null; href: string }
  | { kind: "invoice"; title: string; dueAt: string | null; href: string };

/** L'action la plus urgente (design-system §7) : signature, puis pièce demandée, puis facture en retard. */
export async function getMostUrgentAction(): Promise<ActionRequired | null> {
  const supabase = await createSupabaseServerClient();
  const { data: signature } = await supabase
    .from("signature_requests")
    .select("due_at, documents(display_name)")
    .in("status", ["sent", "viewed"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (signature) {
    const doc = signature.documents as unknown as { display_name: string } | null;
    return {
      kind: "signature",
      title: doc?.display_name ?? "",
      dueAt: signature.due_at,
      href: "/portal/documents",
    };
  }
  const { data: request } = await supabase
    .from("document_requests")
    .select("title, due_date")
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (request)
    return { kind: "request", title: request.title, dueAt: request.due_date, href: "/portal/documents" };
  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number, due_at")
    .eq("status", "overdue")
    .order("due_at")
    .limit(1)
    .maybeSingle();
  if (invoice)
    return { kind: "invoice", title: invoice.invoice_number, dueAt: invoice.due_at, href: "/portal/billing" };
  return null;
}

export type ClientTodo =
  | { kind: "signature"; id: string; title: string; dueAt: string | null; href: string }
  | { kind: "contract"; id: string; title: string; dueAt: string | null; href: string }
  | { kind: "request"; id: string; title: string; dueAt: string | null; matter: string | null; href: string }
  | {
      kind: "invoice";
      id: string;
      title: string;
      dueAt: string | null;
      amount: Money;
      overdue: boolean;
      href: string;
    };

/**
 * « Ce que vous devez faire » (accueil client, ADR 0033) : signatures, documents demandés et factures
 * à régler, les plus urgents d'abord. Lecture sous la session du client (RLS : ses dossiers seulement).
 */
export async function listClientTodos(): Promise<ClientTodo[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: signatures }, { data: requests }, { data: invoices }, contracts] = await Promise.all([
    supabase
      .from("signature_requests")
      .select("id, due_at, documents(display_name)")
      .in("status", ["sent", "viewed"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from("document_requests")
      .select("id, title, due_date, matters(display_number)")
      .eq("status", "pending")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_at, balance_due::text, status")
      .in("status", ["due", "overdue"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(3),
    listMyContracts(),
  ]);
  return [
    // Contrats envoyés à accepter dans le portail (ADR 0035) ; ceux de Clio se signent dans Clio.
    ...contracts
      .filter((c) => c.status === "sent" && c.signing_mode === "portal")
      .slice(0, 3)
      .map((c): ClientTodo => ({
        kind: "contract",
        id: c.id,
        title: c.title,
        dueAt: null,
        href: `/portal/contracts/${c.id}`,
      })),
    ...(signatures ?? []).map((s): ClientTodo => ({
      kind: "signature",
      id: s.id,
      title: (s.documents as unknown as { display_name: string } | null)?.display_name ?? "",
      dueAt: s.due_at,
      href: "/portal/documents",
    })),
    ...(requests ?? []).map((r): ClientTodo => ({
      kind: "request",
      id: r.id,
      title: r.title,
      dueAt: r.due_date,
      matter: (r.matters as unknown as { display_number: string | null } | null)?.display_number ?? null,
      href: "/portal/documents",
    })),
    ...(invoices ?? []).map((i) => {
      const row = i as unknown as {
        id: string;
        invoice_number: string;
        due_at: string | null;
        balance_due: string;
        status: string;
      };
      return {
        kind: "invoice",
        id: row.id,
        title: row.invoice_number,
        dueAt: row.due_at,
        amount: row.balance_due as Money,
        overdue: row.status === "overdue",
        href: "/portal/billing",
      } satisfies ClientTodo;
    }),
  ];
}
