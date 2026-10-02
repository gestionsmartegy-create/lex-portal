import "server-only";
import type { DocumentRow } from "@/types/portal";
import { z } from "zod";
import type { DocumentFolder } from "@/types/domain";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getDocumentStore } from "@/server/providers";
import { assertMatterAccess } from "@/server/services/access-control";
import { recordAudit } from "@/server/services/audit";

/** Colonnes lisibles (ADR 0009) : jamais l'emplacement SharePoint (external_*). */
const DOCUMENT_COLUMNS =
  "id, matter_id, folder, display_name, status, scan_status, mime_type, size_bytes, uploaded_at, matters(display_number, is_mock)";

export type DocumentTab = "shared" | "uploads" | "signed";
const TAB_FOLDERS: Record<DocumentTab, DocumentFolder> = {
  shared: "shared",
  uploads: "client_upload",
  signed: "signed",
};

/** Documents visibles (RLS : sous-dossiers clients uniquement, analyse terminée). */
export async function listDocuments(
  opts: { tab?: DocumentTab; matterId?: string } = {},
): Promise<DocumentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("documents").select(DOCUMENT_COLUMNS).order("uploaded_at", { ascending: false });
  if (opts.tab) query = query.eq("folder", TAB_FOLDERS[opts.tab]);
  if (opts.matterId) {
    await assertMatterAccess(opts.matterId);
    query = query.eq("matter_id", opts.matterId);
  }
  const { data } = await query;
  return (data ?? []) as unknown as DocumentRow[];
}

export async function listPendingRequests(matterId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("document_requests")
    .select("id, matter_id, title, description, due_date, status, matters(display_number)")
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (matterId) query = query.eq("matter_id", matterId);
  const { data } = await query;
  return data ?? [];
}

export async function listPendingSignatures(matterId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("signature_requests")
    .select("id, matter_id, document_id, status, due_at, documents(display_name), matters(display_number)")
    .in("status", ["sent", "viewed"])
    .order("due_at", { ascending: true, nullsFirst: false });
  if (matterId) query = query.eq("matter_id", matterId);
  const { data } = await query;
  return data ?? [];
}

const documentId = z.uuid();

/**
 * Téléchargement EN FLUX (AGENTS.md §6 et §8) — le helper serveur unique :
 *  1. visibilité vérifiée AVEC LA SESSION (RLS : dossier autorisé, sous-dossier client,
 *     analyse terminée) puis assertMatterAccess ;
 *  2. service_role pour lire les SEULES colonnes d'emplacement (non lisibles par l'API) ;
 *  3. journal document.downloaded.
 * Retourne null dans tous les cas de refus (même 404 en amont).
 */
export async function openDocumentForDownload(id: string) {
  if (!documentId.safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, matter_id, display_name, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return null;
  const access = await assertMatterAccess(doc.matter_id);

  // service_role : lecture de l'emplacement externe uniquement (usage permis, AGENTS.md §6).
  const { data: location } = await createSupabaseServiceClient()
    .from("documents")
    .select("external_drive_id, external_item_id")
    .eq("id", doc.id)
    .single();
  const content = await getDocumentStore().openContent(
    { driveId: location?.external_drive_id ?? null, itemId: location?.external_item_id ?? null },
    { displayName: doc.display_name, mimeType: doc.mime_type },
  );
  await recordAudit({
    action: "document.downloaded",
    resourceType: "document",
    resourceId: doc.id,
    matterId: doc.matter_id,
    actorId: access.userId,
  });
  return { ...content, fileName: doc.display_name };
}
