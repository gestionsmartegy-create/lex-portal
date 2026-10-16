"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import {
  courtProvinces,
  provinces,
  saveCourt,
  saveOffice,
  setActive,
  setMatterOffice,
  setStaffOffices,
  timezones,
} from "@/server/services/offices";
import { localeSchema } from "@/server/validation/auth";

/**
 * Bureaux et tribunaux (ADR 0024). Gestion : firm_admin ; bureau d'un dossier : équipe ou firm_admin.
 * Entrées validées par Zod ; résultat via ?notice= ; redirections internes uniquement.
 */
type Notice = "saved" | "archived" | "restored" | "duplicate" | "failed" | "invalid";

function toOffices(locale: string, notice: Notice): never {
  redirect(`/${locale}/admin/offices?notice=${notice}`);
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).default("");
const idField = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export async function saveOfficeAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z
    .object({
      id: idField,
      nameFr: text(80),
      nameEn: text(80),
      city: text(80),
      province: z.enum(provinces),
      timezone: z.enum(timezones),
      address: optional(300),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) toOffices(locale, "invalid");
  const { id, ...input } = parsed.data;
  const r = await saveOffice(id, input);
  toOffices(locale, r.ok ? "saved" : r.code === "DUPLICATE" ? "duplicate" : "failed");
}

export async function saveCourtAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z
    .object({
      id: idField,
      nameFr: text(150),
      nameEn: text(150),
      province: z.enum(courtProvinces),
      timezone: z
        .string()
        .optional()
        .transform((v) => (v ? v : null))
        .pipe(z.enum(timezones).nullable()),
      address: optional(300),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || (parsed.data.province !== "FED" && !parsed.data.timezone))
    toOffices(locale, "invalid");
  const { id, ...input } = parsed.data;
  const r = await saveCourt(id, input);
  toOffices(locale, r.ok ? "saved" : r.code === "DUPLICATE" ? "duplicate" : "failed");
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z
    .object({ kind: z.enum(["office", "court"]), id: z.uuid(), active: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) toOffices(locale, "invalid");
  const active = parsed.data.active === "true";
  const r = await setActive(parsed.data.kind, parsed.data.id, active);
  toOffices(locale, r.ok ? (active ? "restored" : "archived") : "failed");
}

export async function staffOfficesAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale, ["firm_admin"]);
  const parsed = z
    .object({ userId: z.uuid(), primaryId: idField, otherIds: z.array(z.uuid()).max(50) })
    .safeParse({ ...Object.fromEntries(formData), otherIds: formData.getAll("otherIds") });
  if (!parsed.success) toOffices(locale, "invalid");
  const r = await setStaffOffices(parsed.data.userId, parsed.data.primaryId, parsed.data.otherIds);
  toOffices(locale, r.ok ? "saved" : "failed");
}

export async function matterOfficeAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  await requireStaff(locale);
  const parsed = z.object({ matterId: z.uuid(), officeId: idField }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/matters`);
  const r = await setMatterOffice(parsed.data.matterId, parsed.data.officeId);
  redirect(
    `/${locale}/admin/matters/${parsed.data.matterId}?tab=details&notice=${r.ok ? "officeSaved" : "failed"}`,
  );
}
