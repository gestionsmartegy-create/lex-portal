import "server-only";
import { z } from "zod";
import { getSessionRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";

/**
 * Bureaux et tribunaux (ADR 0024, lot 1 du plan « bureaux et calendrier de cour »).
 * Lecture : personnel (RLS) ; écriture : firm_admin (RLS) ; journal par triggers (identifiants seulement).
 * Le bureau ne donne aucun droit sur les dossiers : l'accès reste celui de l'équipe.
 */
export const provinces = [
  "NS",
  "NB",
  "PE",
  "NL",
  "QC",
  "ON",
  "MB",
  "SK",
  "AB",
  "BC",
  "YT",
  "NT",
  "NU",
] as const;
export const courtProvinces = [...provinces, "FED"] as const;
export const timezones = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Regina",
  "America/Edmonton",
  "America/Vancouver",
  "America/Whitehorse",
] as const;
export type Province = (typeof provinces)[number];
export type CourtProvince = (typeof courtProvinces)[number];
export type Timezone = (typeof timezones)[number];

export type Office = {
  id: string;
  name_fr: string;
  name_en: string;
  city: string;
  province: Province;
  timezone: Timezone;
  address: string | null;
  is_active: boolean;
};
export type Court = {
  id: string;
  name_fr: string;
  name_en: string;
  province: CourtProvince;
  timezone: Timezone | null;
  address: string | null;
  is_active: boolean;
};
export type StaffOffice = { user_id: string; office_id: string; is_primary: boolean };

type Result = { ok: true } | { ok: false; code: "NOT_FOUND" | "FAILED" | "DUPLICATE" };
const fail = (code: "NOT_FOUND" | "FAILED" | "DUPLICATE" = "FAILED"): Result => ({ ok: false, code });
const uuid = z.uuid();

async function isStaff() {
  const role = await getSessionRole();
  return role === "staff" || role === "firm_admin";
}
async function isAdmin() {
  return (await getSessionRole()) === "firm_admin";
}

export async function listOffices(opts: { activeOnly?: boolean } = {}): Promise<Office[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("offices")
    .select("id, name_fr, name_en, city, province, timezone, address, is_active")
    .order("position")
    .order("name_en");
  if (opts.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as Office[];
}

export async function listCourts(opts: { activeOnly?: boolean } = {}): Promise<Court[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("courts")
    .select("id, name_fr, name_en, province, timezone, address, is_active")
    .order("position")
    .order("name_en");
  if (opts.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as Court[];
}

export async function listStaffOffices(): Promise<StaffOffice[]> {
  if (!(await isStaff())) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("staff_offices").select("user_id, office_id, is_primary");
  return data ?? [];
}

const errorCode = (code: string | undefined) => (code === "23505" ? fail("DUPLICATE") : fail());

export type OfficeInput = {
  nameFr: string;
  nameEn: string;
  city: string;
  province: Province;
  timezone: Timezone;
  address: string;
};

export async function saveOffice(id: string | null, input: OfficeInput): Promise<Result> {
  if (!(await isAdmin())) return fail("NOT_FOUND");
  if (id && !uuid.safeParse(id).success) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const row = {
    name_fr: input.nameFr,
    name_en: input.nameEn,
    city: input.city,
    province: input.province,
    timezone: input.timezone,
    address: input.address || null,
  };
  const { data, error } = id
    ? await supabase.from("offices").update(row).eq("id", id).select("id")
    : await supabase.from("offices").insert(row).select("id");
  if (error) return errorCode(error.code);
  return data?.length ? { ok: true } : fail("NOT_FOUND");
}

export type CourtInput = {
  nameFr: string;
  nameEn: string;
  province: CourtProvince;
  timezone: Timezone | null;
  address: string;
};

export async function saveCourt(id: string | null, input: CourtInput): Promise<Result> {
  if (!(await isAdmin())) return fail("NOT_FOUND");
  if (id && !uuid.safeParse(id).success) return fail("NOT_FOUND");
  // Un tribunal provincial a toujours un fuseau (contrainte aussi en base).
  if (input.province !== "FED" && !input.timezone) return fail();
  const supabase = await createSupabaseServerClient();
  const row = {
    name_fr: input.nameFr,
    name_en: input.nameEn,
    province: input.province,
    timezone: input.timezone,
    address: input.address || null,
  };
  const { data, error } = id
    ? await supabase.from("courts").update(row).eq("id", id).select("id")
    : await supabase.from("courts").insert(row).select("id");
  if (error) return errorCode(error.code);
  return data?.length ? { ok: true } : fail("NOT_FOUND");
}

/** Archiver ou réactiver (jamais de suppression : dossiers et historique restent rattachés). */
export async function setActive(kind: "office" | "court", id: string, active: boolean): Promise<Result> {
  if (!(await isAdmin()) || !uuid.safeParse(id).success) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(kind === "office" ? "offices" : "courts")
    .update({ is_active: active })
    .eq("id", id)
    .select("id");
  if (error) return fail();
  return data?.length ? { ok: true } : fail("NOT_FOUND");
}

/**
 * Bureaux d'un membre du personnel : un bureau principal (ou aucun) et d'autres bureaux.
 * Une seule transaction en base (public.set_staff_offices) : pas d'état partiel ; les rattachements à un
 * bureau archivé sont conservés ; la base refuse un client, une personne inactive ou un bureau archivé.
 */
export async function setStaffOffices(
  userId: string,
  primaryId: string | null,
  otherIds: string[],
): Promise<Result> {
  if (!(await isAdmin()) || !uuid.safeParse(userId).success) return fail("NOT_FOUND");
  if (primaryId && !uuid.safeParse(primaryId).success) return fail();
  const others = otherIds.filter((id) => uuid.safeParse(id).success);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_staff_offices", {
    p_user: userId,
    // null = aucun bureau principal (accepté par la fonction ; le type généré ne l'exprime pas).
    p_primary: primaryId as string,
    p_others: others,
  });
  return error ? fail() : { ok: true };
}

/** Bureau d'un dossier : équipe du dossier ou firm_admin ; journalisé par la base. */
export async function setMatterOffice(matterId: string, officeId: string | null): Promise<Result> {
  if (!uuid.safeParse(matterId).success || (officeId && !uuid.safeParse(officeId).success))
    return fail("NOT_FOUND");
  if (!(await assertStaffMatterAccess(matterId))) return fail("NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matters")
    .update({ office_id: officeId })
    .eq("id", matterId)
    .select("id");
  if (error) return fail();
  return data?.length ? { ok: true } : fail("NOT_FOUND");
}

/** Bureau principal d'une personne (proposition par défaut à l'ouverture d'un dossier). */
export async function primaryOfficeOf(userId: string): Promise<string | null> {
  if (!(await isStaff()) || !uuid.safeParse(userId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("staff_offices")
    .select("office_id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.office_id ?? null;
}
