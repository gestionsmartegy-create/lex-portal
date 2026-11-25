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
import { importClioEntry, importEntrySchema } from "@/server/services/clio-agenda";
import { localeSchema } from "@/server/validation/auth";

/**
 * Dates de cour (ADR 0025) : équipe du dossier ou firm_admin (le service revérifie l'accès au dossier).
 * Entrées validées par Zod ; résultat via ?notice= ; redirections internes uniquement.
 */
type Notice =
  | "courtSaved"
  | "courtSavedBusy"
  | "courtBusyConflict"
  | "courtConfirmed"
  | "courtHeld"
  | "courtCancelled"
  | "courtAdjourned"
  | "courtInvalid"
  | "clioImported"
  | "failed";

function back(locale: string, matterId: string, notice: Notice, busyId?: string): never {
  // busyId : date en conflit avec Outlook, pour afficher « Confirmer quand même » à côté (uuid validé).
  const busy = busyId ? `&busy=${busyId}` : "";
  redirect(`/${locale}/admin/matters/${matterId}?tab=court&notice=${notice}${busy}`);
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
  if (r.ok) back(locale, matterId, r.busy ? "courtSavedBusy" : "courtSaved");
  back(locale, matterId, r.code === "INVALID" ? "courtInvalid" : "failed");
}

export async function adjournCourtDateAction(formData: FormData): Promise<void> {
  const { locale, matterId } = await context(formData);
  const id = z.uuid().safeParse(formData.get("id"));
  const input = readInput(formData);
  if (!id.success || !input.success) back(locale, matterId, "courtInvalid");
  const r = await adjournCourtDate(id.data, input.data);
  if (r.ok) back(locale, matterId, r.busy ? "courtSavedBusy" : "courtAdjourned");
  back(locale, matterId, r.code === "INVALID" ? "courtInvalid" : "failed");
}

export async function courtDateStatusAction(formData: FormData): Promise<void> {
  const { locale, matterId } = await context(formData);
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(["confirmed", "held", "cancelled"]),
      reason: z.string().trim().max(500).default(""),
      // « Confirmer quand même » malgré un conflit Outlook (choix journalisé par le service).
      override: z.literal("1").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, matterId, "courtInvalid");
  const r = await setCourtDateStatus(parsed.data.id, parsed.data.status, parsed.data.reason, {
    confirmDespiteConflict: parsed.data.override === "1",
  });
  if (!r.ok && r.code === "BUSY_CONFLICT") back(locale, matterId, "courtBusyConflict", parsed.data.id);
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

/** Importer une entrée de l'agenda Clio comme date de cour (ADR 0038) : relue dans Clio par le service. */
export async function importClioEntryAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale);
  const parsed = importEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/matters`);
  const r = await importClioEntry(parsed.data);
  back(locale, parsed.data.matterId, r.ok ? "clioImported" : "failed");
}
