import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { localeSchema } from "@/server/validation/auth";

/** Ancienne adresse : l'espace « Dossier » unifié la remplace (ADR 0020). Session du personnel exigée. */
export default async function LegacyAccessPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters/[matterId]/access">) {
  const raw = await params;
  const locale = localeSchema.safeParse(raw.locale);
  const matterId = z.uuid().safeParse(raw.matterId);
  if (!locale.success || !matterId.success) notFound();
  await requireStaff(locale.data);
  const sp = await searchParams;
  const notice = z
    .string()
    .regex(/^[a-zA-Z]{1,40}$/)
    .safeParse(sp.notice);
  redirect(
    `/${locale.data}/admin/matters/${matterId.data}?tab=team${notice.success ? `&notice=${notice.data}` : ""}`,
  );
}
