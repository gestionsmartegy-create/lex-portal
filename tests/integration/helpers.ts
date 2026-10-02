import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generate } from "otplib";
import type { Database } from "@/types/database";

export const env = () => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export const serviceClient = () => createClient<Database>(env().url, env().service, noPersist);
export const anonClient = () => createClient<Database>(env().url, env().anon, noPersist);

/** Mot de passe de test aléatoire, conforme à la politique (jamais réutilisé, jamais affiché). */
export const testPassword = () => `Tt-${crypto.randomUUID()}!9`;
export const uniqueEmail = (prefix: string, domain = "example.com") =>
  `${prefix}.${crypto.randomUUID().slice(0, 8)}@${domain}`;

export const JOHN_MATTER = "c0000000-0000-4000-8000-000000000142";
export const DEMO_ADMIN = "a0000000-0000-4000-8000-0000000000a1";

/** Connecte un client (session aal1) puis, si demandé, enrôle et vérifie un TOTP (aal2). */
export async function signIn(email: string, password: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function enrollAndVerifyTotp(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) throw error ?? new Error("enroll");
  const code = await generate({ secret: data.totp.secret });
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code });
  if (verifyError) throw verifyError;
  return data.totp.secret;
}

export async function countMatters(client: SupabaseClient<Database>) {
  const { data, error } = await client.from("matters").select("id");
  if (error) throw error;
  return data.length;
}
