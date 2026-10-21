import "server-only";
import { z } from "zod";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { hitRateLimit } from "@/server/security/rate-limit";
import { recordAudit } from "@/server/services/audit";
import {
  assertStaffMatterAccess,
  createDocumentRequest,
  notifyDocumentRequested,
  setDocumentRequestStatus,
} from "@/server/services/matter-tracking";

/**
 * Demandes de documents sur tous les dossiers (ADR 0022, plan phase 2).
 * Lectures avec la session (RLS : demandes des dossiers de ses équipes, ou toutes pour le firm_admin).
 * Chaque action unitaire réutilise les services existants, qui revérifient l'accès au dossier.
 */
const uuid = z.uuid();
export const requestFiltersSchema = z.object({
  status: z.enum(["pending", "overdue", "fulfilled", "cancelled"]).optional().catch(undefined),
  tag: z.uuid().optional().catch(undefined),
  office: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type RequestFilters = z.infer<typeof requestFiltersSchema>;

export type GlobalRequest = {
  id: string;
  matter_id: string;
  title: string;
  title_en: string | null;
  due_date: string | null;
  status: "pending" | "fulfilled" | "overdue" | "cancelled";
  created_at: string;
  requested_from: string;
  overdue: boolean;
  matter: { display_number: string | null; title: string } | null;
  client: { first_name: string | null; last_name: string | null; email: string } | null;
};

const LIMIT = 500;

function todayHalifax() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(new Date());
}

async function isStaff() {
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}

export async function listAllRequests(filters: RequestFilters): Promise<GlobalRequest[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("document_requests")
    .select(
      "id, matter_id, title, title_en, due_date, status, created_at, requested_from, matters!inner(display_number, title, office_id)",
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (filters.status === "fulfilled" || filters.status === "cancelled")
    query = query.eq("status", filters.status);
  if (filters.status === "pending" || filters.status === "overdue") query = query.eq("status", "pending");
  if (filters.office) query = query.eq("matters.office_id", filters.office);
  const { data } = await query;
  let rows = data ?? [];
  if (filters.tag) {
    const { data: links } = await supabase
      .from("matter_tag_links")
      .select("matter_id")
      .eq("tag_id", filters.tag);
    const ids = new Set((links ?? []).map((l) => l.matter_id));
    rows = rows.filter((r) => ids.has(r.matter_id));
  }
  const clientIds = [...new Set(rows.map((r) => r.requested_from))];
  const { data: clients } = clientIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", clientIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string }[] };
  const byId = new Map((clients ?? []).map((c) => [c.id, c]));
  const today = todayHalifax();
  const result = rows.map((r): GlobalRequest => {
    const overdue = r.status === "pending" && r.due_date !== null && r.due_date < today;
    return {
      ...r,
      status: r.status as GlobalRequest["status"],
      overdue,
      matter: r.matters as unknown as GlobalRequest["matter"],
      client: byId.get(r.requested_from) ?? null,
    };
  });
  const q = filters.q?.toLowerCase();
  return result.filter(
    (r) =>
      (filters.status !== "overdue" || r.overdue) &&
      (filters.status !== "pending" || !r.overdue) &&
      (!q ||
        r.title.toLowerCase().includes(q) ||
        (r.title_en ?? "").toLowerCase().includes(q) ||
        (r.matter?.display_number ?? "").toLowerCase().includes(q) ||
        (r.matter?.title ?? "").toLowerCase().includes(q)),
  );
}

/**
 * Dans un lot, un dossier refusé (le contrôle d'accès lève « introuvable ») compte comme un échec
 * sans interrompre les autres : le refus reste un refus, il n'est simplement pas propagé.
 */
async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    // Aucune donnée personnelle : seul le type d'événement est journalisé.
    console.error(JSON.stringify({ event: "bulk_item_failed" }));
    return null;
  }
}

export type BulkAction = "fulfilled" | "cancelled" | "remind";
export type BulkReport = { done: number; failed: number; skipped: number };

/** Action groupée : chaque demande passe par le service unitaire (accès revérifié à chaque fois). */
export async function bulkRequestAction(ids: string[], action: BulkAction): Promise<BulkReport> {
  const report: BulkReport = { done: 0, failed: 0, skipped: 0 };
  if (!(await isStaff())) return { ...report, failed: ids.length };
  const supabase = await createSupabaseServerClient();
  const actorId = (await getUser())?.id;
  for (const id of ids.filter((x) => uuid.safeParse(x).success).slice(0, 100)) {
    if (action === "remind") {
      const { data: r } = await supabase
        .from("document_requests")
        .select("id, matter_id, requested_from, status")
        .eq("id", id)
        .maybeSingle();
      if (!r || r.status !== "pending") {
        report.skipped += 1;
        continue;
      }
      // Contrôle d'accès au dossier (équipe ou firm_admin) AVANT la limite et la notification.
      if (!(await safely(() => assertStaffMatterAccess(r.matter_id)))) {
        report.failed += 1;
        continue;
      }
      // Client dont l'accès a été retiré : pas de relance.
      const { data: active } = await supabase
        .from("matter_access")
        .select("user_id")
        .eq("matter_id", r.matter_id)
        .eq("user_id", r.requested_from)
        .is("revoked_at", null)
        .maybeSingle();
      if (!active) {
        report.skipped += 1;
        continue;
      }
      // Au plus une relance par demande toutes les 24 h.
      if (!(await hitRateLimit(`request:remind:${id}`, { max: 1, windowSeconds: 86_400 }))) {
        report.skipped += 1;
        continue;
      }
      await notifyDocumentRequested(r.matter_id, r.requested_from);
      await recordAudit({
        action: "document_request.reminded",
        resourceType: "document_request",
        resourceId: r.id,
        matterId: r.matter_id,
        actorId: actorId ?? null,
        metadata: { requested_from: r.requested_from },
      });
      report.done += 1;
    } else {
      const res = await safely(() => setDocumentRequestStatus(id, action));
      if (res?.ok) report.done += 1;
      else report.failed += 1;
    }
  }
  return report;
}

/**
 * Même demande envoyée à plusieurs dossiers : une demande par client ayant un accès actif à chacun.
 * createDocumentRequest revérifie l'accès au dossier ; la base exige l'accès actif du client.
 */
export async function bulkCreateRequests(input: {
  matterIds: string[];
  title: string;
  description: string;
  dueDate: string | null;
}): Promise<BulkReport> {
  const report: BulkReport = { done: 0, failed: 0, skipped: 0 };
  if (!(await isStaff())) return { ...report, failed: input.matterIds.length };
  const supabase = await createSupabaseServerClient();
  for (const matterId of input.matterIds.filter((x) => uuid.safeParse(x).success).slice(0, 100)) {
    // Dossiers fermés ignorés (la page ne propose que des dossiers ouverts).
    const { data: matter } = await supabase.from("matters").select("status").eq("id", matterId).maybeSingle();
    if (!matter || matter.status !== "open") {
      report.skipped += 1;
      continue;
    }
    const { data: access } = await supabase
      .from("matter_access")
      .select("user_id")
      .eq("matter_id", matterId)
      .is("revoked_at", null);
    if (!access?.length) {
      report.skipped += 1;
      continue;
    }
    for (const a of access) {
      const r = await safely(() =>
        createDocumentRequest(matterId, {
          clientId: a.user_id,
          templateDocumentId: null,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
        }),
      );
      if (r?.ok) report.done += 1;
      else report.failed += 1;
    }
  }
  return report;
}

// ---------------------------------------------------------------------------------------------
// Demandes par client (2026-10-20) : liste des clients de ses dossiers et demande ciblée.
// ---------------------------------------------------------------------------------------------
export type RequestClient = {
  id: string;
  name: string;
  email: string;
  matters: { id: string; number: string | null; title: string }[];
  pending: number;
  overdue: number;
};

/**
 * Clients ayant un accès ACTIF à un dossier ouvert que la personne voit (RLS : ses équipes, ou tous
 * pour le firm_admin), avec leurs demandes en attente et en retard. Recherche par nom ou courriel.
 */
export async function listRequestClients(q?: string): Promise<RequestClient[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  const { data: access } = await supabase
    .from("matter_access")
    .select("user_id, matter_id, matters!inner(display_number, title, status)")
    .is("revoked_at", null)
    .eq("matters.status", "open")
    .limit(2000);
  const rows = (access ?? []) as unknown as {
    user_id: string;
    matter_id: string;
    matters: { display_number: string | null; title: string };
  }[];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (!ids.length) return [];
  const [{ data: people }, { data: requests }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role, status")
      .in("id", ids)
      .eq("role", "client")
      .eq("status", "active"),
    supabase
      .from("document_requests")
      .select("requested_from, due_date")
      .in("requested_from", ids)
      .eq("status", "pending")
      .limit(LIMIT),
  ]);
  const today = todayHalifax();
  const counts = new Map<string, { pending: number; overdue: number }>();
  for (const r of requests ?? []) {
    const c = counts.get(r.requested_from) ?? { pending: 0, overdue: 0 };
    if (r.due_date !== null && r.due_date < today) c.overdue += 1;
    else c.pending += 1;
    counts.set(r.requested_from, c);
  }
  const needle = q?.trim().toLowerCase();
  return (people ?? [])
    .map((p): RequestClient => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
      const matters = new Map<string, { id: string; number: string | null; title: string }>();
      for (const r of rows)
        if (r.user_id === p.id)
          matters.set(r.matter_id, {
            id: r.matter_id,
            number: r.matters.display_number,
            title: r.matters.title,
          });
      return {
        id: p.id,
        name,
        email: p.email,
        matters: [...matters.values()],
        ...(counts.get(p.id) ?? { pending: 0, overdue: 0 }),
      };
    })
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle))
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}

export const clientRequestSchema = z.object({
  clientId: z.uuid(),
  matterId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(""),
  dueDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.iso.date().nullable()),
});

/**
 * Demande à UN client pour UN de ses dossiers : le client doit avoir un accès actif au dossier
 * (revérifié ici), puis le service commun revérifie l'accès du personnel au dossier, crée la demande
 * et avertit le client.
 */
export async function createClientRequest(input: z.infer<typeof clientRequestSchema>) {
  if (!(await isStaff())) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  // Avec la session (RLS : dossiers de ses équipes) : accès actif du client à ce dossier ouvert.
  const [{ data: access }, { data: person }] = await Promise.all([
    supabase
      .from("matter_access")
      .select("user_id, matters!inner(status)")
      .eq("user_id", input.clientId)
      .eq("matter_id", input.matterId)
      .is("revoked_at", null)
      .eq("matters.status", "open")
      .limit(1),
    supabase.from("profiles").select("role, status").eq("id", input.clientId).maybeSingle(),
  ]);
  if (!access?.length || person?.role !== "client" || person.status !== "active")
    return { ok: false as const };
  const r = await safely(() =>
    createDocumentRequest(input.matterId, {
      clientId: input.clientId,
      templateDocumentId: null,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
    }),
  );
  return { ok: Boolean(r?.ok) };
}
