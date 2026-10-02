import "server-only";
import type { InvoiceRow } from "@/types/portal";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertMatterAccess } from "@/server/services/access-control";

/** Factures visibles (RLS). Montants lus en TEXTE : jamais de flottant (AGENTS.md §5). */
export async function listInvoices(matterId?: string): Promise<InvoiceRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("invoices")
    .select(
      "id, matter_id, invoice_number, issued_at, due_at, amount_total::text, balance_due::text, currency, status, last_synced_at, matters(display_number, is_mock)",
    )
    .order("issued_at", { ascending: false });
  if (matterId) {
    await assertMatterAccess(matterId);
    query = query.eq("matter_id", matterId);
  }
  const { data } = await query;
  return (data ?? []) as unknown as InvoiceRow[];
}
