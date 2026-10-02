import { NextResponse, type NextRequest } from "next/server";
import { CSP_REPORT_MAX_BYTES, parseCspReport } from "@/server/validation/csp-report";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { getRequestContext } from "@/server/security/request-context";
import { hashToken } from "@/server/security/tokens";

const ACCEPTED_TYPES = ["application/csp-report", "application/reports+json", "application/json"];

/**
 * Collecte des violations CSP (ADR 0011). Point public (le navigateur n'envoie pas
 * de session) : taille bornée, limite de débit par IP, validation Zod, log structuré
 * sans URL complète ni donnée personnelle. Réponse toujours vide.
 */
export async function POST(request: NextRequest) {
  const empty = new NextResponse(null, { status: 204 });
  const type = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ACCEPTED_TYPES.includes(type)) return new NextResponse(null, { status: 415 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > CSP_REPORT_MAX_BYTES) return new NextResponse(null, { status: 413 });

  const { ip } = await getRequestContext();
  const key = `csp_report:ip:${ip ? hashToken(ip) : "unknown"}`;
  if (!(await hitRateLimit(key, RATE_LIMITS.cspReportByIp))) return empty;

  const raw = await request.text();
  if (raw.length > CSP_REPORT_MAX_BYTES) return new NextResponse(null, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return empty;
  }
  const violations = parseCspReport(payload);
  for (const v of violations ?? []) console.warn(JSON.stringify({ event: "csp_violation", ...v }));
  return empty;
}
