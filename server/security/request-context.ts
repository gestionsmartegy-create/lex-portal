import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/server/env";

export type RequestContext = { ip: string | null; userAgent: string | null; requestId: string };

const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * IP du client derrière `trustedHops` proxys de confiance (revue J3, M2).
 * Chaque proxy AJOUTE l'adresse qu'il voit à droite de x-forwarded-for : les
 * valeurs de gauche sont fournies par le client et ne sont JAMAIS crues.
 * Avec trustedHops = 0 (pas de proxy), on ne lit pas l'en-tête.
 */
export function parseClientIp(forwardedFor: string | null, trustedHops: number): string | null {
  if (!forwardedFor || trustedHops < 1) return null;
  const parts = forwardedFor
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - trustedHops];
  return candidate && IP_PATTERN.test(candidate) ? candidate : null;
}

/** IP, agent utilisateur, et identifiant de requête GÉNÉRÉ PAR LE SERVEUR (jamais repris du client). */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  return {
    ip: parseClientIp(h.get("x-forwarded-for"), serverEnv().TRUSTED_PROXY_HOPS),
    userAgent: h.get("user-agent"),
    requestId: randomUUID(),
  };
}
