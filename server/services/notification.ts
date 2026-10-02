import "server-only";
import { z } from "zod";
import { getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

const COLUMNS =
  "id, type, priority, title, body, matter_id, action_url, read_at, created_at, matters(display_number)";

export async function listNotifications(limit = 50) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  if (!z.uuid().safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
}

export async function markAllNotificationsRead() {
  const user = await getUser();
  if (!user) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
}

export async function getNotificationPreferences() {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("email_enabled, in_app_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

export async function updateNotificationPreferences(prefs: { email_enabled: boolean }) {
  const user = await getUser();
  if (!user) return { ok: false as const };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notification_preferences")
    .update({ email_enabled: prefs.email_enabled, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  return { ok: !error };
}
