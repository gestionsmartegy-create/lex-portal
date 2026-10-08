import "server-only";
import { z } from "zod";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getMatterAccessDetail } from "@/server/services/admin";
import { assertMatterAccess } from "@/server/services/access-control";
import { getMatterTracking } from "@/server/services/matter-tracking";

/**
 * Espace « Dossier » unifié (ADR 0020) : tout le dossier sur une page pour le cabinet.
 * Accès : getMatterTracking vérifie d'abord l'accès en écriture ET le rôle du personnel
 * (équipe du dossier ou firm_admin) ; toutes les lectures suivantes passent par la RLS.
 */
const uuid = z.uuid();
export const deliverableStatuses = ["planned", "in_progress", "delivered", "cancelled"] as const;
export type DeliverableStatus = (typeof deliverableStatuses)[number];

export type Deliverable = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: DeliverableStatus;
  owner_id: string | null;
  visible_to_client: boolean;
  delivered_at: string | null;
};

export async function getMatterWorkspace(matterId: string) {
  const tracking = await getMatterTracking(matterId);
  if (!tracking) return null;
  const supabase = await createSupabaseServerClient();
  const user = await getUser();
  const isAdmin = (await getSessionRole()) === "firm_admin";
  const nowIso = new Date().toISOString();
  const [
    { data: deliverables },
    { data: documents },
    { data: invoices },
    { data: appointments },
    { data: conversations },
    access,
  ] = await Promise.all([
    supabase
      .from("matter_deliverables")
      .select("id, title, description, due_date, status, owner_id, visible_to_client, delivered_at")
      .eq("matter_id", matterId)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("documents")
      .select("id, display_name, folder, status, uploaded_at")
      .eq("matter_id", matterId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, issued_at, due_at, amount_total::text, balance_due::text, currency, status",
      )
      .eq("matter_id", matterId)
      .order("issued_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, title, starts_at")
      .eq("matter_id", matterId)
      .gte("starts_at", nowIso)
      .order("starts_at")
      .limit(1),
    supabase
      .from("conversations")
      .select("id, subject, last_message_at, closed_at")
      .eq("matter_id", matterId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5),
    // Historique des accès clients : firm_admin seulement (comme l'ancienne page « Accès »).
    isAdmin ? getMatterAccessDetail(matterId) : Promise.resolve(null),
  ]);

  // Messages non lus pour moi (fils du dossier où je suis participant).
  const convIds = (conversations ?? []).map((c) => c.id);
  const { data: mine } =
    convIds.length && user
      ? await supabase
          .from("conversation_participants")
          .select("conversation_id, last_read_at")
          .in("conversation_id", convIds)
          .eq("user_id", user.id)
      : { data: [] as { conversation_id: string; last_read_at: string | null }[] };
  const lastRead = new Map((mine ?? []).map((p) => [p.conversation_id, p.last_read_at]));
  const unreadConversations = (conversations ?? []).filter(
    (c) =>
      c.last_message_at &&
      (!lastRead.get(c.id) || new Date(lastRead.get(c.id)!) < new Date(c.last_message_at)),
  ).length;

  // Dernière activité connue : message, étape terminée, demande, livrable remis.
  const dates = [
    ...(conversations ?? []).map((c) => c.last_message_at),
    ...tracking.steps.map((s) => s.completed_at),
    ...tracking.requests.map((r) => r.created_at),
    ...(deliverables ?? []).map((d) => d.delivered_at),
  ].filter((d): d is string => Boolean(d));
  const lastActivity = dates.length ? dates.sort().at(-1)! : null;

  const today = nowIso.slice(0, 10);
  const pendingRequests = tracking.requests.filter((r) => r.status === "pending");
  const overdueRequests = pendingRequests.filter((r) => r.due_date !== null && r.due_date < today);
  // Somme en centimes entiers à partir des chaînes décimales (AGENTS.md §5 : jamais de flottant).
  const balanceCents = (invoices ?? [])
    .filter((i) => (i.status === "due" || i.status === "overdue") && i.currency === "CAD")
    .reduce((sum, i) => sum + toCents(i.balance_due), 0);

  return {
    ...tracking,
    deliverables: (deliverables ?? []) as Deliverable[],
    documents: documents ?? [],
    invoices: invoices ?? [],
    nextAppointment: appointments?.[0] ?? null,
    conversations: conversations ?? [],
    access: access?.access ?? [],
    kpis: {
      pendingRequests: pendingRequests.length,
      overdueRequests: overdueRequests.length,
      unreadConversations,
      balanceDue: fromCents(balanceCents),
      currency: "CAD",
      lastActivity,
    },
  };
}

function toCents(value: string | null): number {
  if (!value) return 0;
  const negative = value.trim().startsWith("-");
  const [whole = "0", frac = ""] = value.trim().replace("-", "").split(".");
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt((frac + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Livrables (équipe du dossier ou firm_admin ; RLS matter_deliverables_*)
// ---------------------------------------------------------------------------
type Result = { ok: true } | { ok: false; code: "NOT_FOUND" | "FAILED" };
const fail = (code: "NOT_FOUND" | "FAILED" = "FAILED"): Result => ({ ok: false, code });

async function assertStaffWrite(matterId: string) {
  await assertMatterAccess(matterId, "read_write");
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}

function logFailure(event: string, code: string | undefined) {
  console.error(JSON.stringify({ event, code: code ?? "unknown" }));
}

export async function addDeliverable(
  matterId: string,
  input: {
    title: string;
    description: string;
    dueDate: string | null;
    ownerId: string | null;
    visible: boolean;
  },
): Promise<Result> {
  if (!uuid.safeParse(matterId).success || !(await assertStaffWrite(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("matter_deliverables").insert({
    matter_id: matterId,
    title: input.title,
    description: input.description || null,
    due_date: input.dueDate,
    owner_id: input.ownerId,
    visible_to_client: input.visible,
  });
  if (error) logFailure("deliverable_add_failed", error.code);
  return error ? fail() : { ok: true };
}

/** Lit le livrable (RLS) pour connaître son dossier, puis contrôle l'accès. */
async function loadDeliverable(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("matter_deliverables")
    .select("id, matter_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || !(await assertStaffWrite(data.matter_id))) return null;
  return { supabase, deliverable: data };
}

export async function setDeliverableStatus(id: string, status: DeliverableStatus): Promise<Result> {
  const loaded = await loadDeliverable(id);
  if (!loaded) return fail("NOT_FOUND");
  const { data, error } = await loaded.supabase
    .from("matter_deliverables")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) logFailure("deliverable_status_failed", error.code);
  return error || !data?.length ? fail() : { ok: true };
}

export async function removeDeliverable(id: string): Promise<Result> {
  const loaded = await loadDeliverable(id);
  if (!loaded) return fail("NOT_FOUND");
  const { data, error } = await loaded.supabase
    .from("matter_deliverables")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) logFailure("deliverable_remove_failed", error.code);
  return error || !data?.length ? fail() : { ok: true };
}

/** Lie un document du dossier à une demande : la base la marque « reçue » (trigger). */
export async function linkRequestDocument(requestId: string, documentId: string): Promise<Result> {
  if (!uuid.safeParse(requestId).success || !uuid.safeParse(documentId).success) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data: request } = await supabase
    .from("document_requests")
    .select("id, matter_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || !(await assertStaffWrite(request.matter_id))) return fail("NOT_FOUND");
  const { data, error } = await supabase
    .from("document_requests")
    .update({ fulfilled_document_id: documentId })
    .eq("id", requestId)
    .select("id");
  if (error) logFailure("request_link_failed", error.code);
  return error || !data?.length ? fail() : { ok: true };
}
