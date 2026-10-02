/**
 * Expiration des sessions (ADR 0012). Décision du responsable du 2026-10-02 :
 * 30 min d'inactivité, avertissement avec compte à rebours avant la déconnexion.
 * Le serveur (public.touch_session) tranche à 32 min : 2 min de marge pour le
 * décalage entre l'activité vue par le navigateur et le dernier signal reçu.
 */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const WARNING_DURATION_MS = 2 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;
export const SESSION_CHANNEL = "lex-session";
export const TIMEOUT_REASON = "timeout";

export type IdlePhase =
  { phase: "active" } | { phase: "warning"; remainingMs: number } | { phase: "expired" };

/** Phase à partir du temps écoulé depuis la dernière activité. Pur, testé. */
export function idlePhase(idleMs: number): IdlePhase {
  if (idleMs >= IDLE_TIMEOUT_MS) return { phase: "expired" };
  const warningStart = IDLE_TIMEOUT_MS - WARNING_DURATION_MS;
  if (idleMs >= warningStart) return { phase: "warning", remainingMs: IDLE_TIMEOUT_MS - idleMs };
  return { phase: "active" };
}

/** « 1:05 » — minutes et secondes restantes, arrondies à la seconde supérieure. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
