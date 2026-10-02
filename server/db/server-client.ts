import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { serverEnv } from "@/server/env";

/**
 * Client Supabase avec la SESSION DE L'UTILISATEUR (cookies HttpOnly) :
 * la RLS s'applique. À utiliser pour toutes les lectures de l'interface
 * (AGENTS.md §6). Jamais de service_role ici.
 */
export async function createSupabaseServerClient() {
  const env = serverEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un Server Component (lecture seule) : proxy.ts rafraîchit les cookies.
        }
      },
    },
  });
}
