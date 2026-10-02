import "server-only";
import { z } from "zod";

/**
 * Rapports de violation CSP (ADR 0011) : deux formats coexistent.
 * - `application/csp-report` (report-uri, ancien) : { "csp-report": { … } }
 * - `application/reports+json` (report-to, API Reporting) : [{ type: "csp-violation", body: { … } }]
 * Seuls les champs utiles au diagnostic sont gardés ; le reste est ignoré.
 */
export const CSP_REPORT_MAX_BYTES = 16 * 1024;

const legacy = z.object({
  "csp-report": z.object({
    "document-uri": z.string().max(2048).optional(),
    "effective-directive": z.string().max(128).optional(),
    "violated-directive": z.string().max(512).optional(),
    "blocked-uri": z.string().max(2048).optional(),
    disposition: z.enum(["enforce", "report"]).optional(),
  }),
});

const modern = z
  .array(
    z.object({
      type: z.string().max(64),
      body: z.object({
        documentURL: z.string().max(2048).optional(),
        effectiveDirective: z.string().max(128).optional(),
        blockedURL: z.string().max(2048).optional(),
        disposition: z.enum(["enforce", "report"]).optional(),
      }),
    }),
  )
  .max(20);

export type CspViolation = { directive: string; blocked: string; page: string; disposition: string };

/**
 * Réduit une URL à ce qui peut être journalisé SANS donnée personnelle (AGENTS.md §5) :
 * origine pour une ressource externe, chemin SANS requête ni fragment pour une page.
 */
export function redactUrl(value: string | undefined, keep: "origin" | "path"): string {
  if (!value) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value.slice(0, 32); // « inline », « eval », « trusted-types-sink »…
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return url.protocol;
    return keep === "origin" ? url.origin : url.pathname.slice(0, 256);
  } catch {
    return "invalid";
  }
}

export function parseCspReport(payload: unknown): CspViolation[] | null {
  const old = legacy.safeParse(payload);
  if (old.success) {
    const r = old.data["csp-report"];
    return [
      {
        directive: r["effective-directive"] ?? r["violated-directive"]?.split(" ")[0] ?? "",
        blocked: redactUrl(r["blocked-uri"], "origin"),
        page: redactUrl(r["document-uri"], "path"),
        disposition: r.disposition ?? "enforce",
      },
    ];
  }
  const recent = modern.safeParse(payload);
  if (recent.success) {
    return recent.data
      .filter((r) => r.type === "csp-violation")
      .map((r) => ({
        directive: r.body.effectiveDirective ?? "",
        blocked: redactUrl(r.body.blockedURL, "origin"),
        page: redactUrl(r.body.documentURL, "path"),
        disposition: r.body.disposition ?? "enforce",
      }));
  }
  return null;
}
