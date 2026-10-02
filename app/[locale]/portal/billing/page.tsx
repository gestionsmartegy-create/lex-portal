import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvoiceList } from "@/components/portal/lists";
import { Freshness } from "@/components/portal/matter-parts";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { requireClientSession } from "@/server/auth/session";
import { listInvoices } from "@/server/services/billing";

export default async function BillingPage({ params }: PageProps<"/[locale]/portal/billing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/billing`);
  const [t, invoices] = await Promise.all([getTranslations("portal.billing"), listInvoices()]);
  const lastSync =
    invoices
      .map((i) => i.last_synced_at)
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
            {invoices.some((i) => i.matters?.is_mock) ? <DemoDataBadge /> : null}
            <Freshness at={lastSync} />
          </>
        }
      />
      <SectionCard title={t("invoices")}>
        <InvoiceList invoices={invoices} />
      </SectionCard>
    </>
  );
}
