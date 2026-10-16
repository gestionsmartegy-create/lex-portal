"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  adjournCourtDate,
  courtDateInputSchema,
  createCourtDate,
  setCourtCalendar,
  setCourtDateStatus,
  updateCourtDate,
} from "@/server/services/court-dates";
import { localeSchema } from "@/server/validation/auth";

/**
 * Dates de cour (ADR 0025) : équipe du dossier ou firm_admin (le service revérifie l'accès au dossier).
 * Entrées validées par Zod ; résultat via ?notice= ; redirections internes uniquement.
 */
type Notice =
  | "courtSaved"
  | "courtConfirmed"
  | "courtHeld"
  | "courtCancelled"
  | "courtAdjourned"
  | "courtInvalid"
  | "failed";

function back(locale: string, matterId: string, notice: Notice): never {
  redirect(`/${locale}/admin/matters/${matterId}?tab=court&notice=${notice}`);
}

const ctx = z.object({ locale: localeSchema, matterId: z.uuid() });

/** Champs du formulaire de date de cour → saisie validée. */
function readInput(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return courtDateInputSchema.safeParse({
    ...raw,
    allDay: raw.allDay === "on",
    visibleToClient: raw.visibleToClient === "on",
    attendeeIds: formData.getAll("attendeeIds"),
  });
}

/** Contexte (langue, dossier) ; sinon retour neutre au portefeuille. */
async function context(formData: FormData) {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale);
  const parsed = ctx.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/matters`);
  return parsed.data;
}

export async function saveCourtDateAction(formData: FormData): Promise<void> {
  const { locale, matterId } = await context(formData);
  const id = z
    .uuid()
    .optional()
    .catch(undefined)
    .parse(formData.get("id") || undefined);
  const input = readInput(formData);
  if (!input.success) back(locale, matterId, "courtInvalid");
  const r = id ? await updateCourtDate(id, input.data) : await createCourtDate(matterId, input.data);
  back(locale, matterId, r.ok ? "courtSaved" : r.code === "INVALID" ? "courtInvalid" : "failed");
}

export async function adjournCourtDateAction(formData: FormData): Promise<void> {
  const { locale, matterId } = await context(formData);
  const id = z.uuid().safeParse(formData.get("id"));
  const input = readInput(formData);
  if (!id.success || !input.success) back(locale, matterId, "courtInvalid");
  const r = await adjournCourtDate(id.data, input.data);
  back(locale, matterId, r.ok ? "courtAdjourned" : r.code === "INVALID" ? "courtInvalid" : "failed");
}

export async function courtDateStatusAction(formData: FormData): Promise<void> {
  const { locale, matterId } = await context(formData);
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(["confirmed", "held", "cancelled"]),
      reason: z.string().trim().max(500).default(""),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, matterId, "courtInvalid");
  const r = await setCourtDateStatus(parsed.data.id, parsed.data.status, parsed.data.reason);
  const ok: Record<typeof parsed.data.status, Notice> = {
    confirmed: "courtConfirmed",
    held: "courtHeld",
    cancelled: "courtCancelled",
  };
  back(locale, matterId, r.ok ? ok[parsed.data.status] : r.code === "INVALID" ? "courtInvalid" : "failed");
}

/** Calendrier Clio où sont écrites les dates de cour (firm_admin). */
export async function courtCalendarAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z
    .object({
      calendarId: z
        .string()
        .optional()
        .transform((v) => (v ? Number(v) : null))
        .pipe(z.number().int().positive().nullable()),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/integrations?notice=failed`);
  const ok = await setCourtCalendar(parsed.data.calendarId);
  redirect(`/${locale}/admin/integrations?notice=${ok ? "calendarSaved" : "failed"}`);
}
