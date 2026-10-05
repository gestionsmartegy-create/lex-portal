import "server-only";
import { randomUUID } from "node:crypto";
import type { ConversationSummary } from "@/types/portal";
import { z } from "zod";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertMatterAccess } from "@/server/services/access-control";
import { recordAudit } from "@/server/services/audit";
import { notifyNewMessage } from "@/server/services/message-notifier";

/** Fils visibles (RLS : participant + dossier autorisé), du plus récent au plus ancien. */
export async function listConversations(opts: { matterId?: string; limit?: number } = {}) {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("conversations")
    .select("id, matter_id, subject, last_message_at, closed_at, created_at, matters(display_number, title)")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (opts.matterId) {
    await assertMatterAccess(opts.matterId);
    query = query.eq("matter_id", opts.matterId);
  }
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
  const role = await getSessionRole();
  await notifyNewMessage({
    conversationId,
    matterId: conversation.matter_id,
    senderId: user.id,
    senderIsClient: role === "client",
  });
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
  // Identifiant généré ici, insertion sans retour : la RLS ne voit le fil qu'après l'inscription
  // de son auteur comme participant (trigger), voir la migration 20261006120000.
  const conversation = { id: randomUUID() };
  const { error } = await supabase
    .from("conversations")
    .insert({ id: conversation.id, matter_id: matterId, scope: "matter", subject, created_by: user.id });
  if (error) return { ok: false as const, code: "FAILED" as const };
  const sent = await sendMessage(conversation.id, body);
  return sent.ok ? { ok: true as const, conversationId: conversation.id } : sent;
}

// ---------------------------------------------------------------------------
// Côté cabinet (J7, ADR 0017)
// ---------------------------------------------------------------------------
export type StaffConversation = {
  id: string;
  subject: string | null;
  matter_id: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  matter: { display_number: string | null; title: string } | null;
  clients: string[];
  unread: boolean;
};

/**
 * Fils des dossiers visibles par le membre du cabinet (RLS : équipe du dossier ou firm_admin).
 * Non lu = un message plus récent que ma dernière lecture (ou fil jamais ouvert).
 */
export async function listStaffConversations(
  opts: { unreadOnly?: boolean } = {},
): Promise<StaffConversation[]> {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, subject, matter_id, last_message_at, closed_at, matters(display_number, title)")
    .not("matter_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (!conversations?.length) return [];
  const ids = conversations.map((c) => c.id);
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, last_read_at, profiles(first_name, last_name, role)")
    .in("conversation_id", ids);

  const rows = conversations.map((c): StaffConversation => {
    const mine = (participants ?? []).find((p) => p.conversation_id === c.id && p.user_id === user.id);
    const clients = (participants ?? [])
      .filter((p) => p.conversation_id === c.id)
      .map(
        (p) =>
          p.profiles as unknown as {
            first_name: string | null;
            last_name: string | null;
            role: string;
          } | null,
      )
      .filter(
        (p): p is { first_name: string | null; last_name: string | null; role: string } =>
          p?.role === "client",
      )
      .map((p) => [p.first_name, p.last_name].filter(Boolean).join(" "))
      .filter(Boolean);
    const unread = Boolean(
      c.last_message_at && (!mine?.last_read_at || new Date(mine.last_read_at) < new Date(c.last_message_at)),
    );
    return {
      id: c.id,
      subject: c.subject,
      matter_id: c.matter_id,
      last_message_at: c.last_message_at,
      closed_at: c.closed_at,
      matter: c.matters as StaffConversation["matter"],
      clients,
      unread,
    };
  });
  return opts.unreadOnly ? rows.filter((r) => r.unread) : rows;
}

export async function countStaffUnread(): Promise<number> {
  return (await listStaffConversations({ unreadOnly: true })).length;
}

/**
 * Ouvrir un fil côté cabinet. Ordre imposé (AGENTS.md §2.4) : retrouver le dossier du fil,
 * contrôler l'accès au dossier, PUIS rejoindre le fil (RPC join_conversation, réservée à l'équipe
 * du dossier et au firm_admin) et le lire. Une nouvelle inscription est journalisée
 * (`conversation.joined`) : elle donne accès à tous les messages du fil. Refus = null (404).
 */
export async function openConversationAsStaff(conversationId: string) {
  const user = await getUser();
  if (!user || !uuid.safeParse(conversationId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, matter_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.matter_id) return null;
  await assertMatterAccess(conversation.matter_id);
  const { data: already } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: joined } = await supabase.rpc("join_conversation", { p_conversation: conversationId });
  if (joined !== true) return null;
  if (!already)
    await recordAudit({
      action: "conversation.joined",
      resourceType: "conversation",
      resourceId: conversationId,
      matterId: conversation.matter_id,
      actorId: user.id,
    });
  const data = await getConversation(conversationId);
  if (data) await markConversationRead(conversationId);
  return data;
}

/** Nouveau fil ouvert par le cabinet : l'auteur + tous les clients ayant un accès actif au dossier. */
export async function startConversationAsStaff(matterId: string, subject: string, body: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, code: "NOT_FOUND" as const };
  await assertMatterAccess(matterId, "read_write");
  const supabase = await createSupabaseServerClient();
  const conversation = { id: randomUUID() }; // voir startConversation
  const { error } = await supabase
    .from("conversations")
    .insert({ id: conversation.id, matter_id: matterId, scope: "matter", subject, created_by: user.id });
  if (error) return { ok: false as const, code: "FAILED" as const };
  const { data: clients } = await supabase
    .from("matter_access")
    .select("user_id")
    .eq("matter_id", matterId)
    .is("revoked_at", null);
  if (clients?.length) {
    const { error: participantsError } = await supabase
      .from("conversation_participants")
      .insert(clients.map((c) => ({ conversation_id: conversation.id, user_id: c.user_id })));
    if (participantsError) return { ok: false as const, code: "FAILED" as const };
  }
  const sent = await sendMessage(conversation.id, body);
  return sent.ok ? { ok: true as const, conversationId: conversation.id } : sent;
}

/**
 * Clore un fil : accès en écriture au dossier vérifié AVANT la modification (AGENTS.md §2.4) ;
 * la RLS (conversations_staff_update : équipe du dossier ou firm_admin) revérifie.
 */
export async function closeConversation(conversationId: string) {
  const user = await getUser();
  if (!user || !uuid.safeParse(conversationId).success) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("matter_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.matter_id) return { ok: false as const };
  await assertMatterAccess(conversation.matter_id, "read_write");
  const { data, error } = await supabase
    .from("conversations")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .is("closed_at", null)
    .select("id, matter_id")
    .maybeSingle();
  if (error || !data) return { ok: false as const };
  await recordAudit({
    action: "conversation.closed",
    resourceType: "conversation",
    resourceId: data.id,
    matterId: data.matter_id,
    actorId: user.id,
  });
  return { ok: true as const };
}
