"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { openMatter } from "@/server/services/matter-opening";
import { localeSchema } from "@/server/validation/auth";

/**
 * Assistant d'ouverture d'un dossier (ADR 0020) : firm_admin seulement (requireStaff + RLS).
 * Entrée validée par Zod ; redirection interne vers l'espace du dossier.
 */
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.iso.date().nullable());

const schema = z.object({
  locale: localeSchema,
  matterId: z.uuid(),
  typeId: z.uuid(),
  applySteps: z.literal("on").optional(),
  responsibleId: optionalUuid,
  collaboratorIds: z.array(z.uuid()).max(20),
  clientId: optionalUuid,
  accessLevel: z.enum(["read", "read_write"]).default("read"),
  documentIds: z.array(z.uuid()).max(50),
  documentsDue: optionalDate,
  deliverableTitles: z.array(z.string().trim().max(200)).max(5),
  deliverableDues: z.array(z.string()).max(5),
});

export async function openMatterAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const parsed = schema.safeParse({
    ...raw,
    collaboratorIds: formData.getAll("collaboratorIds"),
    documentIds: formData.getAll("documentIds"),
    deliverableTitles: formData.getAll("deliverableTitles"),
    deliverableDues: formData.getAll("deliverableDues"),
  });
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  if (!parsed.success) redirect(`/${locale}/admin/matters/new?notice=invalid`);
  const d = parsed.data;
  await requireStaff(d.locale, ["firm_admin"]);
  const deliverables = d.deliverableTitles
    .map((title, i) => {
      const due = z.iso.date().safeParse(d.deliverableDues[i] ?? "");
      return { title, dueDate: due.success ? due.data : null };
    })
    .filter((x) => x.title.length > 0);
  const report = await openMatter({
    matterId: d.matterId,
    typeId: d.typeId,
    applySteps: d.applySteps === "on",
    responsibleId: d.responsibleId,
    collaboratorIds: d.collaboratorIds,
    clientId: d.clientId,
    accessLevel: d.accessLevel,
    documentIds: d.clientId ? d.documentIds : [],
    documentsDue: d.documentsDue,
    deliverables,
  });
  if (report.failed.includes("role") || report.failed.includes("type"))
    redirect(`/${d.locale}/admin/matters/new?notice=failed`);
  const partial = report.failed.length ? `&partial=${report.failed.join(",")}` : "";
  redirect(`/${d.locale}/admin/matters/${d.matterId}?notice=opened${partial}`);
}
