import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionRole } from "@/server/auth/session";
import { getAppointment, toIcs } from "@/server/services/appointment";

/** Export .ics d'un rendez-vous visible (RLS) ; même 404 sinon. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const missing = new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!z.uuid().safeParse(appointmentId).success || !(await getSessionRole())) return missing;
  const appointment = await getAppointment(appointmentId);
  if (!appointment) return missing;
  return new NextResponse(toIcs(appointment), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lex-canada-appointment.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
