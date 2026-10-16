"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit } from "@/server/security/rate-limit";
import {
  bulkCreateRequests,
  bulkRequestAction,
  requestFiltersSchema,
} from "@/server/services/document-requests";
import { localeSchema } from "@/server/validation/auth";

/**
 * Demandes de documents sur tous les dossiers (ADR 0022) : personnel (équipe ou firm_admin).
 * Entrée validée par Zod (listes bornées) ; chaque élément repasse par le contrôle d'accès du service.
 * Le résultat (compteurs entiers) est affiché via l'URL ; redirection interne uniquement.
 */
const counts = (r: { done: number; failed: number; skipped: number }) =>
  `done=${r.done}&failed=${r.failed}&skipped=${r.skipped}`;

export async function bulkRequestsAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const parsed = z
    .object({
      locale: localeSchema,
      action: z.enum(["fulfilled", "cancelled", "remind"]),
      ids: z.array(z.uuid()).min(1).max(100),
    })
    .safeParse({ ...Object.fromEntries(formData), ids: formData.getAll("ids") });
  if (!parsed.success) redirect(`/${locale}/admin/requests?notice=invalid`);
  await requireStaff(parsed.data.locale);
  const report = await bulkRequestAction(parsed.data.ids, parsed.data.action);
  // Les filtres de la liste sont conservés (revalidés par Zod, encodés dans l'URL interne).
  const filters = requestFiltersSchema.parse({
    q: formData.get("q") || undefined,
    status: formData.get("status") || undefined,
    tag: formData.get("tag") || undefined,
    office: formData.get("office") || undefined,
  });
  const keep = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => typeof e[1] === "string"),
  ).toString();
  redirect(
    `/${parsed.data.locale}/admin/requests?notice=${parsed.data.action}&${counts(report)}${keep ? `&${keep}` : ""}`,
  );
}

export async function bulkCreateRequestsAction(formData: FormData): Promise<void> {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const parsed = z
    .object({
      locale: localeSchema,
      matterIds: z.array(z.uuid()).min(1).max(100),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).default(""),
      dueDate: z
        .string()
        .optional()
        .transform((v) => (v ? v : null))
        .pipe(z.iso.date().nullable()),
    })
    .safeParse({ ...Object.fromEntries(formData), matterIds: formData.getAll("matterIds") });
  if (!parsed.success) redirect(`/${locale}/admin/requests/new?notice=invalid`);
  const { user } = await requireStaff(parsed.data.locale);
  // Au plus 10 envois groupés par heure et par personne (chacun peut notifier beaucoup de clients).
  if (!(await hitRateLimit(`requests:bulk-create:${user.id}`, { max: 10, windowSeconds: 3600 })))
    redirect(`/${parsed.data.locale}/admin/requests/new?notice=tooMany`);
  const report = await bulkCreateRequests({
    matterIds: parsed.data.matterIds,
    title: parsed.data.title,
    description: parsed.data.description,
    dueDate: parsed.data.dueDate,
  });
  redirect(`/${parsed.data.locale}/admin/requests?notice=created&${counts(report)}`);
}
