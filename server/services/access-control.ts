import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { AccessLevel } from "@/types/domain";
import { getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

const uuid = z.uuid();

export type MatterAccessResult = { matterId: string; userId: string; accessLevel: AccessLevel };

/** Droits EFFECTIFS sur un dossier pour la session courante (RPC matter_permissions,
 * mêmes règles que la RLS : client actif + MFA, ou personnel de l'équipe / firm_admin). */
async function matterPermissions(matterId: string): Promise<{ canRead: boolean; canWrite: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("matter_permissions", { p_matter: matterId }).maybeSingle();
  return { canRead: data?.can_read === true, canWrite: data?.can_write === true };
}

/**
 * Vérification d'accès à un dossier (AGENTS.md §2.4), AVANT toute lecture ou tout
 * appel externe. La RLS revérifie derrière. Un dossier inexistant, non autorisé ou
 * mal formé donne la MÊME réponse : 404 (AGENTS.md §2.9).
 *  - « read » : le dossier est lisible pour la session (client ou personnel) ;
 *  - « read_write » : écriture permise (client read_write, équipe du dossier, firm_admin).
 */
export async function assertMatterAccess(
  matterId: string,
  level: AccessLevel = "read",
): Promise<MatterAccessResult> {
  if (!uuid.safeParse(matterId).success) notFound();
  const user = await getUser();
  if (!user) notFound();
  const { canRead, canWrite } = await matterPermissions(matterId);
  if (!canRead) notFound();
  if (level === "read_write" && !canWrite) notFound();
  return { matterId, userId: user.id, accessLevel: canWrite ? "read_write" : "read" };
}

/** Variante sans exception, pour masquer une action (ex. bouton « Répondre »). */
export async function canWriteMatter(matterId: string): Promise<boolean> {
  if (!uuid.safeParse(matterId).success) return false;
  if (!(await getUser())) return false;
  return (await matterPermissions(matterId)).canWrite;
}
