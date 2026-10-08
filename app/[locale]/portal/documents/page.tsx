import { FilePen, FileQuestion } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DocumentList } from "@/components/portal/lists";
import { TabLinks } from "@/components/portal/tab-links";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { formatCalendarDate, formatDate } from "@/lib/format";
import { requireClientSession } from "@/server/auth/session";
import {
  listDocuments,
  listPendingRequests,
  listPendingSignatures,
  type DocumentTab,
} from "@/server/services/document";

const TABS: DocumentTab[] = ["shared", "uploads", "signed"];

export default async function DocumentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/portal/documents">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/documents`);
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "shared";
  const [t, documents, requests, signatures] = await Promise.all([
    getTranslations("portal.documents"),
    listDocuments({ tab }),
    listPendingRequests(undefined, locale),
    listPendingSignatures(),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={documents.some((d) => d.matters?.is_mock) ? <DemoDataBadge /> : null}
      />

      {signatures.length > 0 || requests.length > 0 ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {signatures.length > 0 ? (
            <SectionCard title={t("signatures")}>
              <ul className="space-y-3">
                {signatures.map((s) => {
                  const doc = s.documents as unknown as { display_name: string } | null;
                  const matter = s.matters as unknown as { display_number: string | null } | null;
                  return (
                    <li key={s.id} className="flex gap-3">
                      <FilePen aria-hidden className="mt-0.5 size-5 shrink-0 text-[#B91C1C]" />
                      <div>
                        <p className="text-sm font-medium text-marine">{doc?.display_name}</p>
                        <p className="text-xs text-ink-muted">
                          {[
                            matter?.display_number,
                            s.due_at ? t("requestDue", { date: formatDate(s.due_at, locale) }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4">
                <InfoNote>{t("signSoon")}</InfoNote>
              </div>
            </SectionCard>
          ) : null}
          {requests.length > 0 ? (
            <SectionCard title={t("requests")}>
              <ul className="space-y-3">
                {requests.map((r) => {
                  const matter = r.matters as unknown as { display_number: string | null } | null;
                  return (
                    <li key={r.id} className="flex gap-3">
                      <FileQuestion aria-hidden className="mt-0.5 size-5 shrink-0 text-gold-ink" />
                      <div>
                        <p className="text-sm font-medium text-marine">{r.title}</p>
                        {r.description ? <p className="text-xs text-ink-muted">{r.description}</p> : null}
                        <p className="text-xs text-ink-muted">
                          {[
                            matter?.display_number,
                            r.due_date
                              ? t("requestDue", { date: formatCalendarDate(r.due_date, locale) })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4">
                <InfoNote>{t("uploadSoon")}</InfoNote>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      <TabLinks
        label={t("tabsLabel")}
        items={TABS.map((x) => ({
          href: x === "shared" ? "/portal/documents" : `/portal/documents?tab=${x}`,
          label: t(`tabs.${x}`),
          active: x === tab,
        }))}
      />
      <SectionCard>
        <DocumentList documents={documents} />
      </SectionCard>
    </>
  );
}
