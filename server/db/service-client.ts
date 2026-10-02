import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { serverEnv } from "@/server/env";

/**
 * Client service_role — CONTOURNE LA RLS. Usages permis (AGENTS.md §6), chacun
 * commenté au point d'appel :
 *   - acceptation d'invitation, pré-création du personnel (API admin Auth) ;
 *   - limitation de débit (RPC rate_limit_hit) ;
 *   - écriture d'audit (RPC record_audit_event) ;
 *   - (Phase 2+) synchronisation, webhooks, notifications, emplacement de document.
 * Ne jamais l'utiliser pour lire des données à afficher à un utilisateur.
 */
export function createSupabaseServiceClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
