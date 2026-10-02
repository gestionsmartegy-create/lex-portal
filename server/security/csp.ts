/**
 * Construction de la Content-Security-Policy (docs/security.md, ADR 0006).
 * Utilisé par proxy.ts (runtime Edge/Node) : pas d'import "server-only" ici,
 * car proxy.ts n'est jamais embarqué côté client.
 */

/** Point de collecte des violations CSP (ADR 0011). */
export const CSP_REPORT_PATH = "/api/security/csp-report";
export const CSP_REPORT_GROUP = "csp";

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Origine Supabase (API + Realtime), si configurée. */
  supabaseUrl?: string;
};

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    connect.push(origin, origin.replace(/^http/, "ws"));
  }
  if (isDev) connect.push("ws://localhost:*", "ws://127.0.0.1:*"); // rechargement à chaud

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Scripts : nonce + strict-dynamic, jamais 'unsafe-inline'. 'unsafe-eval' en dev uniquement (React).
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Feuilles et balises <style> : nonce (Next l'applique automatiquement) en production.
    // En développement, Turbopack injecte des <style> sans nonce (rechargement à chaud) :
    // 'unsafe-inline' seul, car un nonce présent le désactiverait (constaté le 2026-10-01).
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    // Attributs style="…" (positionnement Radix, barres de progression) : exception documentée (ADR 0006).
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    // Rapports de violation (ADR 0011) : report-to (moderne) et report-uri (repli Firefox/Safari).
    "report-to": [CSP_REPORT_GROUP],
    "report-uri": [CSP_REPORT_PATH],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/**
 * Politique en observation seule (Content-Security-Policy-Report-Only, ADR 0011) :
 * Trusted Types contre les XSS par injection DOM. Elle ne bloque rien, elle signale ;
 * elle passera dans la politique bloquante une fois l'absence de violation constatée.
 */
export function buildReportOnlyCsp(): string {
  return [
    "require-trusted-types-for 'script'",
    `report-to ${CSP_REPORT_GROUP}`,
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

/** En-tête Reporting-Endpoints : l'API Reporting exige une URL absolue. */
export function reportingEndpoints(origin: string): string {
  return `${CSP_REPORT_GROUP}="${origin}${CSP_REPORT_PATH}"`;
}
