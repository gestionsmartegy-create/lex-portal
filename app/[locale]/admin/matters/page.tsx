import { FolderOpen } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/session";
import { listAdminMatters } from "@/server/services/admin";

export default async function AdminMattersPage({ params }: PageProps<"/[locale]/admin/matters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const [t, matters] = await Promise.all([getTranslations("admin.matters"), listAdminMatters()]);
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            {matters.some((m) => m.is_mock) ? <DemoDataBadge /> : null}
            {role === "firm_admin" ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/admin/matters/new">{t("openNew")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <SectionCard>
        {matters.length === 0 ? (
          <EmptyState icon={FolderOpen} message={t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {matters.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium text-marine">{m.title}</p>
                  <p className="text-xs text-ink-muted">
                    {[m.display_number, m.practice_area, m.responsible_name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <MatterStatusBadge status={m.status} />
                  <Button asChild variant="outline-gold" size="sm">
                    <Link href={`/admin/matters/${m.id}`}>{t("open")}</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
