import "server-only";
import type { InvoiceStatus, MatterStatus } from "@/types/domain";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getClioGateway, getClioTokenStore } from "@/server/providers";
import { ClioError, type ClioManageGateway } from "@/server/providers/clio/gateway";
import type { ClioBill, ClioMatter } from "@/server/providers/clio/schemas";
import { recordAudit } from "@/server/services/audit";

/**
 * SyncService (Phase 2, ADR 0014) — Clio Manage → cache Supabase, LECTURE seule.
 * service_role : écriture du cache synchronisé (usage permis : synchronisation, AGENTS.md §6).
 * Règles :
 *  - seuls les dossiers d'un contact Clio IMPORTÉ explicitement par un firm_admin, ou déjà
 *    liés (clio_matter_id), sont synchronisés : aucune copie massive des données du cabinet ;
 *  - la synchronisation ne donne JAMAIS d'accès : l'octroi reste une action du firm_admin ;
 *  - factures : seules celles émises au client (en attente de paiement, payées, annulées) ;
 *    jamais les brouillons ni celles en approbation.
 */
const MATTER_STATUS: Record<string, MatterStatus> = { Open: "open", Pending: "on_hold", Closed: "closed" };

export function mapMatter(m: ClioMatter, isMock: boolean) {
  return {
    clio_matter_id: String(m.id),
    display_number: m.display_number ?? null,
    title: m.description || m.display_number || `Clio #${m.id}`,
    practice_area: m.practice_area?.name ?? null,
    status: (m.status && MATTER_STATUS[m.status]) || "open",
    responsible_name: m.responsible_attorney?.name ?? null,
    opened_at: m.open_date ?? null,
    closed_at: m.close_date ?? null,
    is_mock: isMock,
    last_synced_at: new Date().toISOString(),
  };
}

/** Montant JSON → chaîne décimale à 2 décimales (aucun calcul ensuite, AGENTS.md §5). */
const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "0.00";

export function mapBill(b: ClioBill, matterId: string, today: string): Record<string, unknown> | null {
  let status: InvoiceStatus;
  if (b.state === "paid") status = "paid";
  else if (b.state === "void") status = "void";
  else if (b.state === "awaiting_payment")
    status = b.due_at && b.due_at < today && (b.balance ?? 0) > 0 ? "overdue" : "due";
  else return null; // brouillon, en approbation, supprimée : jamais montrée au client
  return {
    clio_bill_id: String(b.id),
    matter_id: matterId,
    invoice_number: b.number ?? `Clio #${b.id}`,
    issued_at: b.issued_at ?? null,
    due_at: b.due_at ?? null,
    amount_total: money(b.total),
    balance_due: money(b.balance),
    currency: "CAD",
    status,
    clio_state: b.state ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

async function upsertMatterWithBills(gateway: ClioManageGateway, m: ClioMatter) {
  const admin = createSupabaseServiceClient();
  const { data: row, error } = await admin
    .from("matters")
    .upsert(mapMatter(m, gateway.isMock), { onConflict: "clio_matter_id" })
    .select("id")
    .single();
  if (error || !row) return { ok: false as const, bills: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const bills = (await gateway.listBillsForMatter(m.id))
    .map((b) => mapBill(b, row.id, today))
    .filter((b): b is Record<string, unknown> => b !== null);
  if (bills.length) {
    const { error: billError } = await admin
      .from("invoices")
      .upsert(bills as never, { onConflict: "clio_bill_id" });
    if (billError) return { ok: false as const, bills: 0 };
  }
  return { ok: true as const, bills: bills.length };
}

/** Import des dossiers d'UN contact Clio, trouvé par son e-mail exact (firm_admin). */
export async function importClioContact(email: string, actorId: string) {
  const gateway = getClioGateway();
  try {
    const contacts = (await gateway.findContactsByEmail(email)).filter(
      (c) => c.primary_email_address?.toLowerCase() === email.toLowerCase(),
    );
    if (contacts.length !== 1)
      return { ok: false as const, code: contacts.length ? "AMBIGUOUS" : "NOT_FOUND" };
    const contact = contacts[0]!;
    const matters = await gateway.listMattersForClient(contact.id);
    let imported = 0;
    let bills = 0;
    for (const m of matters) {
      const r = await upsertMatterWithBills(gateway, m);
      if (r.ok) {
        imported += 1;
        bills += r.bills;
      }
    }
    // Lien avec un compte client existant du portail (même e-mail), pour les invitations futures.
    const admin = createSupabaseServiceClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (profile?.role === "client") {
      await admin
        .from("external_accounts")
        .upsert(
          {
            user_id: profile.id,
            provider: "clio_manage",
            external_id: String(contact.id),
            external_region: "ca",
          },
          { onConflict: "provider,external_id", ignoreDuplicates: true },
        );
    }
    if (!gateway.isMock) await getClioTokenStore().report(true);
    await recordAudit({
      action: "integration.imported",
      resourceType: "integration",
      resourceId: "clio_manage",
      actorId,
      metadata: { matters: imported, bills, mock: gateway.isMock },
    });
    return { ok: true as const, matters: imported, bills, clioContactId: contact.id };
  } catch (error) {
    const code = error instanceof ClioError ? error.code : "UPSTREAM";
    if (!gateway.isMock) await getClioTokenStore().report(false, code);
    console.error(JSON.stringify({ event: "clio_import_failed", code }));
    return { ok: false as const, code };
  }
}

/** Resynchronisation de tous les dossiers déjà liés à Clio (planificateur ou bouton). */
export async function syncLinkedMatters(actorId: string | null) {
  const gateway = getClioGateway();
  const admin = createSupabaseServiceClient();
  const { data: linked } = await admin
    .from("matters")
    .select("clio_matter_id")
    .not("clio_matter_id", "is", null)
    .is("purged_at", null);
  let updated = 0;
  let failed = 0;
  try {
    for (const row of linked ?? []) {
      const m = await gateway.getMatter(Number(row.clio_matter_id));
      if (!m) {
        failed += 1;
        continue;
      }
      const r = await upsertMatterWithBills(gateway, m);
      if (r.ok) updated += 1;
      else failed += 1;
    }
    if (!gateway.isMock) await getClioTokenStore().report(failed === 0, failed ? "PARTIAL" : undefined);
  } catch (error) {
    const code = error instanceof ClioError ? error.code : "UPSTREAM";
    if (!gateway.isMock) await getClioTokenStore().report(false, code);
    console.error(JSON.stringify({ event: "clio_sync_failed", code }));
    return { ok: false as const, code, updated, failed };
  }
  await recordAudit({
    action: "integration.synced",
    resourceType: "integration",
    resourceId: "clio_manage",
    actorId,
    metadata: { updated, failed, mock: gateway.isMock },
  });
  return { ok: true as const, updated, failed };
}
