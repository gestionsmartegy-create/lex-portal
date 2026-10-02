import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AppRole, Profile } from "@/types/domain";
import { createSupabaseServerClient } from "@/server/db/server-client";

export type SessionProfile = Pick<
  Profile,
  "id" | "email" | "first_name" | "last_name" | "preferred_language" | "role" | "status" | "client_number"
>;

const PROFILE_COLUMNS = "id, email, first_name, last_name, preferred_language, role, status, client_number";

/** Utilisateur VALIDÉ auprès de Supabase Auth (jamais getSession() seul pour autoriser). */
export async function getUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export type Assurance = { current: "aal1" | "aal2" | null; hasVerifiedFactor: boolean };

export async function getAssurance(): Promise<Assurance> {
  const supabase = await createSupabaseServerClient();
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  return {
    current: (aal?.currentLevel as Assurance["current"]) ?? null,
    hasVerifiedFactor: (factors?.totp ?? []).some((f) => f.status === "verified"),
  };
}

/**
 * Rôle EFFECTIF tel que la base le reconnaît pour cette session (RPC
 * current_session_role) : null si client sans MFA, personnel sans session
 * Microsoft, ou compte inactif. Source unique, alignée sur la RLS (ADR 0010).
 */
export async function getSessionRole(): Promise<AppRole | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("current_session_role");
  return error ? null : (data ?? null);
}

/** Profil lu AVEC la session (RLS). */
export async function getProfile(userId: string): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  return (data as SessionProfile | null) ?? null;
}

function withNext(path: string, next?: string) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** Client : session valide (compte actif + aal2), sinon login ou MFA ; autre rôle → 404. */
export async function requireClientSession(locale: string, next?: string) {
  const user = await getUser();
  if (!user) redirect(withNext(`/${locale}/login`, next));
  const role = await getSessionRole();
  if (role === null) {
    const assurance = await getAssurance();
    if (assurance.current !== "aal2") redirect(withNext(`/${locale}/login/mfa`, next));
    notFound(); // compte inactif
  }
  if (role !== "client") notFound();
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  return { user, profile };
}

/** Personnel : rôle effectif staff/firm_admin (session Microsoft, ou *.test en local) ; sinon 404. */
export async function requireStaff(locale: string, roles: AppRole[] = ["staff", "firm_admin"]) {
  const user = await getUser();
  if (!user) redirect(`/${locale}/staff/login`);
  const role = await getSessionRole();
  if (!role || !roles.includes(role)) notFound();
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  return { user, profile, role };
}
