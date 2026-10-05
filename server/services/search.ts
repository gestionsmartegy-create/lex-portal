import "server-only";
import type { DocumentRow } from "@/types/portal";
import { z } from "zod";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { hitRateLimit, type RateLimitRule } from "@/server/security/rate-limit";
import { escapeLikePattern } from "@/lib/search";

/**
 * Recherche globale du portail client (docs/page-map.md, `/portal/search`).
 * - Lectures avec la session de l'utilisateur : la RLS limite les résultats à ce qu'il voit déjà
 *   (ses dossiers, les documents des sous-dossiers clients, ses propres fils).
 * - Le texte recherché n'est JAMAIS journalisé (il peut contenir des données personnelles).
 * - Réservée au client : un autre rôle reçoit une liste vide (la RLS du personnel est plus large).
 * - Chaque filtre est un appel `.ilike()` séparé : aucune chaîne `.or()` construite à partir de
 *   l'entrée (pas d'injection de filtre PostgREST) ; les jokers `%` `_` `\` sont échappés.
 */
// `*` est retiré AVANT la vérification de longueur : « ** » ne doit pas devenir un motif vide.
export const searchQuerySchema = z
  .string()
  .transform((s) => s.replace(/\*/g, "").trim())
  .pipe(z.string().min(2).max(100));

const SEARCH_LIMIT: RateLimitRule = { max: 60, windowSeconds: 10 * 60 };
const PER_GROUP = 10;

const DOCUMENT_COLUMNS =
  "id, matter_id, folder, display_name, status, scan_status, mime_type, size_bytes, uploaded_at, matters(display_number, is_mock)";

export type SearchMatter = { id: string; display_number: string | null; title: string; is_mock: boolean };
export type SearchConversation = { id: string; subject: string | null; matter_number: string | null };
export type SearchResults =
  | { status: "ok"; matters: SearchMatter[]; documents: DocumentRow[]; conversations: SearchConversation[] }
  | { status: "rate_limited" };

export async function searchPortal(query: string): Promise<SearchResults> {
  const user = await getUser();
  const empty = { status: "ok" as const, matters: [], documents: [], conversations: [] };
  if (!user || (await getSessionRole()) !== "client") return empty;
  if (!(await hitRateLimit(`search:user:${user.id}`, SEARCH_LIMIT))) return { status: "rate_limited" };

  const pattern = `%${escapeLikePattern(query)}%`;
  const supabase = await createSupabaseServerClient();
  const matterColumns = "id, display_number, title, is_mock";
  const [byNumber, byTitle, documents, bySubject, byBody] = await Promise.all([
    supabase.from("matters").select(matterColumns).ilike("display_number", pattern).limit(PER_GROUP),
    supabase.from("matters").select(matterColumns).ilike("title", pattern).limit(PER_GROUP),
    supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .ilike("display_name", pattern)
      .order("uploaded_at", { ascending: false })
      .limit(PER_GROUP),
    supabase
      .from("conversations")
      .select("id")
      .ilike("subject", pattern)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(PER_GROUP),
    supabase
      .from("messages")
      .select("conversation_id")
      .ilike("body", pattern)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Une requête en échec donne « aucun résultat » côté client ; côté serveur, on le signale (code seul).
  for (const r of [byNumber, byTitle, documents, bySubject, byBody])
    if (r.error) console.error(JSON.stringify({ event: "search_query_failed", code: r.error.code }));
  const matters = uniqueById([...(byNumber.data ?? []), ...(byTitle.data ?? [])]).slice(0, PER_GROUP);
  const conversationIds = [
    ...new Set([
      ...(bySubject.data ?? []).map((c) => c.id),
      ...(byBody.data ?? []).map((m) => m.conversation_id),
    ]),
  ].slice(0, PER_GROUP);
  const { data: conversations } = conversationIds.length
    ? await supabase
        .from("conversations")
        .select("id, subject, last_message_at, matters(display_number)")
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
    : { data: [] };

  return {
    status: "ok",
    matters,
    documents: (documents.data ?? []) as unknown as DocumentRow[],
    conversations: (conversations ?? []).map((c) => ({
      id: c.id,
      subject: c.subject,
      matter_number:
        (c.matters as unknown as { display_number: string | null } | null)?.display_number ?? null,
    })),
  };
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}
