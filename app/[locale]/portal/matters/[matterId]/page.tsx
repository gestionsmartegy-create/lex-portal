import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppointmentList, ConversationList, DocumentList, InvoiceList } from "@/components/portal/lists";
import { Freshness, MatterStatusBadge } from "@/components/portal/matter-parts";
import { NewConversationForm } from "@/components/portal/message-forms";
import { TabLinks } from "@/components/portal/tab-links";
import { EmptyState, PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatDate } from "@/lib/format";
import { startConversationAction } from "@/server/actions/portal";
import { requireClientSession } from "@/server/auth/session";
import { listAppointments } from "@/server/services/appointment";
import { listInvoices } from "@/server/services/billing";
import { listDocuments } from "@/server/services/document";
import { getMatterDetail } from "@/server/services/matter";
import { listConversations } from "@/server/services/messaging";

const TABS = ["overview", "timeline", "documents", "messages", "invoices", "appointments"] as const;
type Tab = (typeof TABS)[number];

export default async function MatterPage({
  params,
  searchParams,
}: PageProps<"/[locale]/portal/matters/[matterId]">) {
  const { locale, matterId } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/matters/${matterId}`);
  const sp = await searchParams;
  const tab: Tab = TABS.find((x) => x === sp.tab) ?? "overview";

  // Accès vérifié en premier (assertMatterAccess) : 404 identique si absent ou non autorisé.
  const { matter, timeline, fields, accessLevel } = await getMatterDetail(matterId, locale);
  const t = await getTranslations("portal");
  const base = `/portal/matters/${matterId}`;

  let content: React.ReactNode = null;
  if (tab === "overview") {
    content = (
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title={t("matter.tabs.overview")} className="lg:col-span-2">
          {matter.description ? <p className="mb-5 text-sm text-ink-muted">{matter.description}</p> : null}
          {matter.progress_percent !== null ? (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-marine uppercase">
                {t("common.progress")}
              </p>
              <ProgressBar value={matter.progress_percent} label={t("common.progress")} />
            </div>
          ) : null}
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              [t("matter.practiceArea"), matter.practice_area],
              [t("matter.responsible"), matter.responsible_name],
              [t("matter.opened"), matter.opened_at ? formatCalendarDate(matter.opened_at, locale) : null],
              [t("matter.closed"), matter.closed_at ? formatCalendarDate(matter.closed_at, locale) : null],
              [
                t("matter.access"),
                accessLevel === "read_write" ? t("matter.accessWrite") : t("matter.accessRead"),
              ],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-muted">{k}</dt>
                  <dd className="font-medium text-marine">{v}</dd>
                </div>
              ))}
          </dl>
        </SectionCard>
        <div className="space-y-6">
          <SectionCard title={t("matter.tabs.timeline")}>
            <Timeline steps={timeline} locale={locale} t={t} compact />
          </SectionCard>
          {fields.length > 0 ? (
            <SectionCard title={t("matter.details")}>
              <dl className="space-y-3 text-sm">
                {fields.map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs text-ink-muted">{f.label}</dt>
                    <dd className="font-medium break-words text-marine">
                      {f.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(f.value)
                        ? formatCalendarDate(f.value, locale)
                        : f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          ) : null}
        </div>
      </div>
    );
  } else if (tab === "timeline") {
    content = (
      <SectionCard>
        <Timeline steps={timeline} locale={locale} t={t} />
      </SectionCard>
    );
  } else if (tab === "documents") {
    content = (
      <SectionCard>
        <DocumentList documents={await listDocuments({ matterId })} />
      </SectionCard>
    );
  } else if (tab === "messages") {
    const conversations = await listConversations({ matterId });
    content = (
      <div className="space-y-6">
        <SectionCard>
          <ConversationList conversations={conversations} />
        </SectionCard>
        {accessLevel === "read_write" ? (
          <SectionCard title={t("matter.newMessage")}>
            <NewConversationForm action={startConversationAction} locale={locale} matterId={matterId} />
          </SectionCard>
        ) : (
          <p className="text-sm text-ink-muted">{t("messages.readOnly")}</p>
        )}
      </div>
    );
  } else if (tab === "invoices") {
    content = (
      <SectionCard>
        <InvoiceList invoices={await listInvoices(matterId)} />
      </SectionCard>
    );
  } else {
    const { upcoming, past } = await listAppointments({ matterId });
    content = (
      <SectionCard>
        <AppointmentList appointments={[...upcoming, ...past]} />
      </SectionCard>
    );
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/portal/matters"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("matters.title")}
        </Link>
      </p>
      <PageHeader
        title={matter.title}
        subtitle={[matter.display_number, matter.practice_area].filter(Boolean).join(" · ")}
        actions={
          <>
            <MatterStatusBadge status={matter.status} />
            {matter.is_mock ? <DemoDataBadge /> : null}
            <Freshness at={matter.last_synced_at} />
          </>
        }
      />
      <TabLinks
        label={t("matter.tabsLabel")}
        items={TABS.map((x) => ({
          href: x === "overview" ? base : `${base}?tab=${x}`,
          label: t(`matter.tabs.${x}`),
          active: x === tab,
        }))}
      />
      {content}
    </>
  );
}

type Step = {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
};

function Timeline({
  steps,
  locale,
  t,
  compact,
}: {
  steps: Step[];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<"portal">>>;
  compact?: boolean;
}) {
  if (steps.length === 0) return <EmptyState icon={ListChecks} message={t("matter.timelineEmpty")} />;
  return (
    <ol className="space-y-4">
      {steps.map((s) => (
        <li key={s.id} className="flex gap-3">
          {s.is_completed ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-[#15803D]" />
          ) : (
            <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          )}
          <div>
            <p className={`text-sm font-medium ${s.is_completed ? "text-marine" : "text-ink-muted"}`}>
              {s.title}
            </p>
            <p className="text-xs text-ink-muted">
              {s.is_completed && s.completed_at
                ? t("matter.stepDone", { date: formatDate(s.completed_at, locale) })
                : t("matter.stepPending")}
            </p>
            {!compact && s.description ? (
              <p className="mt-1 text-sm text-ink-muted">{s.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
