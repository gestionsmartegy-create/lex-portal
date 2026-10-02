import "server-only";
import { createSupabaseServiceClient } from "@/server/db/service-client";

export type RateLimitRule = { max: number; windowSeconds: number };

/** Règles par action (ADR 0010). Clés construites sans donnée personnelle en clair. */
export const RATE_LIMITS = {
  loginByIp: { max: 20, windowSeconds: 15 * 60 },
  loginByAccount: { max: 8, windowSeconds: 15 * 60 },
  mfaByUser: { max: 10, windowSeconds: 15 * 60 },
  passwordResetByIp: { max: 5, windowSeconds: 60 * 60 },
  invitationAcceptByIp: { max: 10, windowSeconds: 60 * 60 },
  invitationCreateByUser: { max: 50, windowSeconds: 60 * 60 },
  cspReportByIp: { max: 60, windowSeconds: 60 },
  mfaResetByUser: { max: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Lecture SANS incrément (true = encore autorisé). Échec fermé. */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient().rpc("rate_limit_check", {
    p_key: key,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_error", code: error.code }));
    return false;
  }
  return data === true;
}

/**
 * true = action autorisée. En cas d'erreur technique, on REFUSE (échec fermé).
 * service_role : seule la RPC rate_limit_hit est appelée (usage permis, AGENTS.md §6).
 */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient().rpc("rate_limit_hit", {
    p_key: key,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_error", code: error.code }));
    return false;
  }
  return data === true;
}
