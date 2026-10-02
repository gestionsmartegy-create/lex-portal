import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { syncLinkedMatters } from "@/server/services/sync";

export const maxDuration = 300;

/**
 * Synchronisation planifiée (Vercel Cron, ADR 0014). Secret d'en-tête OBLIGATOIRE
 * (`Authorization: Bearer <CRON_SECRET>`), comparé en temps constant ; sinon 404.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const valid =
    Boolean(secret) &&
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!valid) return new NextResponse("Not found", { status: 404 });
  const result = await syncLinkedMatters(null);
  return NextResponse.json(
    { ok: result.ok, updated: result.updated, failed: result.failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
