import { FolderOpen } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Freshness, MatterRow } from "@/components/portal/matter-parts";
import { TabLinks } from "@/components/portal/tab-links";
import { EmptyState, PageHeader } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { requireClientSession } from "@/server/auth/session";
import { listMatters, mattersRequiringAction, type MatterFilter } from "@/server/services/matter";

const FILTERS: MatterFilter[] = ["all", "active", "closed"];

export default async function MattersPage({ params, searchParams }: PageProps<"/[locale]/portal/matters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/matters`);
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f === sp.filter) ?? "all";
  const [t, matters, actionSet] = await Promise.all([
    getTranslations("portal.matters"),
    listMatters(filter),
    mattersRequiringAction(),
  ]);
  const lastSync =
    matters
      .map((m) => m.last_synced_at)
      .filter(Boolean)
      .sort()
      .at(0) ?? null;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            {matters.some((m) => m.is_mock) ? <DemoDataBadge /> : null}
            <Freshness at={lastSync} />
          </>
        }
      />
      <TabLinks
        label={t("filterLabel")}
        items={FILTERS.map((f) => ({
          href: f === "all" ? "/portal/matters" : `/portal/matters?filter=${f}`,
          label: t(`filters.${f}`),
          active: f === filter,
        }))}
      />
      {matters.length === 0 ? (
        <EmptyState icon={FolderOpen} message={t("none")} />
      ) : (
        <ul className="space-y-3">
          {matters.map((m) => (
            <li key={m.id}>
              <MatterRow matter={m} actionRequired={actionSet.has(m.id)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
