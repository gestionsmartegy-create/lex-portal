"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { canonicalViewQuery, removeView, saveView } from "@/server/services/matter-board";
import { localeSchema } from "@/server/validation/auth";

/**
 * Vues enregistrées du portefeuille (ADR 0023) : personnel. Entrée validée par Zod, filtres remis
 * sous forme canonique par le service ; redirection interne vers le portefeuille uniquement.
 */
function back(locale: string, query: string, notice: string): never {
  redirect(`/${locale}/admin/matters?${query ? `${query}&` : ""}notice=${notice}`);
}

export async function saveViewAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const locale = localeSchema.catch("en").parse(raw.locale);
  await requireStaff(locale);
  const query = canonicalViewQuery(raw);
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(raw);
  if (!parsed.success) back(locale, query, "viewInvalid");
  const r = await saveView(parsed.data.name, raw);
  back(
    locale,
    query,
    r.ok
      ? "viewSaved"
      : r.code === "DUPLICATE"
        ? "viewDuplicate"
        : r.code === "LIMIT"
          ? "viewLimit"
          : "viewFailed",
  );
}

export async function removeViewAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const parsed = z.object({ id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(locale, "", "viewRemoveFailed");
  await requireStaff(locale);
  const r = await removeView(parsed.data.id);
  back(locale, "", r.ok ? "viewRemoved" : "viewRemoveFailed");
}
