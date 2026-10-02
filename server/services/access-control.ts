import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { AccessLevel } from "@/types/domain";
import { getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

const uuid = z.uuid();

export type MatterAccessResult = { matterId: string; userId: string; accessLevel: AccessLevel };

/**
 * Vérification d'accès à un dossier (AGENTS.md §2.4), AVANT toute lecture ou tout
 * appel externe. La RLS revérifie derrière. Un dossier inexistant, non autorisé ou
 * mal formé donne la MÊME réponse : 404 (AGENTS.md §2.9).
 *  - « read » : le dossier est lisible avec la session de l'utilisateur ;
 *  - « read_write » : accès client actif de niveau read_write (non révoqué).
 */
export async function assertMatterAccess(
  matterId: string,
  level: AccessLevel = "read",
): Promise<MatterAccessResult> {
  if (!uuid.safeParse(matterId).success) notFound();
  const user = await getUser();
  if (!user) notFound();
  const supabase = await createSupabaseServerClient();

  const { data: matter } = await supabase.from("matters").select("id").eq("id", matterId).maybeSingle();
  if (!matter) notFound();

  const { data: access } = await supabase
    .from("matter_access")
    .select("access_level")
    .eq("matter_id", matterId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  const accessLevel: AccessLevel = access?.access_level ?? "read";
  if (level === "read_write" && accessLevel !== "read_write") notFound();
  return { matterId, userId: user.id, accessLevel };
}

/** Variante sans exception, pour masquer une action (ex. bouton « Répondre »). */
export async function canWriteMatter(matterId: string): Promise<boolean> {
  if (!uuid.safeParse(matterId).success) return false;
  const user = await getUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("matter_access")
    .select("access_level")
    .eq("matter_id", matterId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  return data?.access_level === "read_write";
}
