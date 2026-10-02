import "server-only";
import { headers } from "next/headers";

export type RequestContext = { ip: string | null; userAgent: string | null; requestId: string | null };

/** Adresse IP (premier saut de x-forwarded-for), agent utilisateur et identifiant de requête, pour l'audit. */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: h.get("user-agent"), requestId: h.get("x-request-id") };
}
