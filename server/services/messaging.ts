import "server-only";
import type { ConversationSummary } from "@/types/portal";
import { z } from "zod";
import { getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertMatterAccess } from "@/server/services/access-control";
import { recordAudit } from "@/server/services/audit";

/** Fils visibles (RLS : participant + dossier autorisé), du plus récent au plus ancien. */
export async function listConversations(opts: { matterId?: string; limit?: number } = {}) {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("conversations")
    .select("id, matter_id, subject, last_message_at, closed_at, created_at, matters(display_number, title)")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (opts.matterId) query = query.eq("matter_id", opts.matterId);
  if (opts.limit) query = query.limit(opts.limit);
  const { data: conversations } = await query;
  if (!conversations?.length) return [];

  const ids = conversations.map((c) => c.id);
  const [{ data: participants }, { data: messages }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .in("conversation_id", ids)
      .eq("user_id", user.id),
    supabase
      .from("messages")
      .select("conversation_id, body, sender_id, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const lastRead = new Map((participants ?? []).map((p) => [p.conversation_id, p.last_read_at]));
  const latest = new Map<string, { body: string; sender_id: string; created_at: string }>();
  for (const m of messages ?? []) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);

  return conversations.map((c): ConversationSummary => {
    const last = latest.get(c.id) ?? null;
    const read = lastRead.get(c.id);
    return {
      id: c.id,
      matter_id: c.matter_id,
      subject: c.subject,
      last_message_at: c.last_message_at,
      closed_at: c.closed_at,
      matters: c.matters as ConversationSummary["matters"],
      lastMessage: last,
      unread: Boolean(
        last && last.sender_id !== user.id && (!read || new Date(read) < new Date(last.created_at)),
      ),
    };
  });
}

const uuid = z.uuid();

export async function getConversation(conversationId: string) {
  if (!uuid.safeParse(conversationId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, matter_id, subject, closed_at, matters(display_number, title)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;
  if (conversation.matter_id) await assertMatterAccess(conversation.matter_id);
  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))];
  const { data: senders } = senderIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, role, title").in("id", senderIds)
    : { data: [] };
  return { conversation, messages: messages ?? [], senders: senders ?? [] };
}

/** Marque le fil comme lu pour l'utilisateur (RLS : sa propre ligne de participant). */
export async function markConversationRead(conversationId: string) {
  const user = await getUser();
  if (!user || !uuid.safeParse(conversationId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
}

export const messageBodySchema = z.string().trim().min(1, "EMPTY").max(5000, "TOO_LONG");

/**
 * Envoi d'un message : accès read_write au dossier vérifié AVANT l'écriture
 * (AGENTS.md §2.4) ; la RLS (messages_insert) revérifie. Le contenu n'est jamais
 * journalisé (AGENTS.md §5) : seulement les identifiants.
 */
export async function sendMessage(conversationId: string, body: string) {
  const user = await getUser();
  if (!user || !uuid.safeParse(conversationId).success)
    return { ok: false as const, code: "NOT_FOUND" as const };
  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, matter_id, closed_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || conversation.closed_at) return { ok: false as const, code: "NOT_FOUND" as const };
  if (conversation.matter_id) await assertMatterAccess(conversation.matter_id, "read_write");

  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body })
    .select("id")
    .single();
  if (error || !message) return { ok: false as const, code: "FAILED" as const };
  await markConversationRead(conversationId);
  await recordAudit({
    action: "message.sent",
    resourceType: "message",
    resourceId: message.id,
    matterId: conversation.matter_id,
    actorId: user.id,
  });
  return { ok: true as const };
}

/** Nouveau fil sur un dossier (read_write), avec un premier message. */
export async function startConversation(matterId: string, subject: string, body: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, code: "NOT_FOUND" as const };
  await assertMatterAccess(matterId, "read_write");
  const supabase = await createSupabaseServerClient();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({ matter_id: matterId, scope: "matter", subject, created_by: user.id })
    .select("id")
    .single();
  if (error || !conversation) return { ok: false as const, code: "FAILED" as const };
  const sent = await sendMessage(conversation.id, body);
  return sent.ok ? { ok: true as const, conversationId: conversation.id } : sent;
}
