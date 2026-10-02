import "server-only";
import type { Money } from "@/types/domain";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { countUnreadNotifications } from "@/server/services/notification";

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
