import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { pushCourtDateReminders } from "@/server/services/client-court-dates";
import { syncOutlookCalendars } from "@/server/services/calendar-connections";
import { pullClioCourtDateChanges, pushPendingCourtDates } from "@/server/services/court-dates";
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
  // Dates de cour en attente ou en échec : nouvelle tentative d'écriture dans Clio (ADR 0025).
  const courts = await pushPendingCourtDates();
  // Rappels J-7 et J-1 aux clients (dates rendues visibles), une seule fois chacun (ADR 0028).
  const reminders = await pushCourtDateReminders().catch(() => {
    console.error(JSON.stringify({ event: "court_reminders_failed" }));
    return { sent: 0, failed: -1 };
  });
  // Dates modifiées ou supprimées directement dans Clio : signalées (ADR 0031).
  const clioChanges = await pullClioCourtDateChanges().catch(() => {
    console.error(JSON.stringify({ event: "court_date_clio_pull_failed", code: "UNEXPECTED" }));
    return { moved: 0, missing: 0, skipped: true };
  });
  // Agendas Outlook connectés : plages occupées et rappels de préparation (ADR 0031).
  const calendars = await syncOutlookCalendars().catch(() => {
    console.error(JSON.stringify({ event: "calendar_sync_failed", code: "UNEXPECTED" }));
    return { synced: 0, failed: -1 };
  });
  return NextResponse.json(
    {
      ok: result.ok,
      updated: result.updated,
      failed: result.failed,
      courtDates: courts,
      reminders,
      clioChanges,
      calendars,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
