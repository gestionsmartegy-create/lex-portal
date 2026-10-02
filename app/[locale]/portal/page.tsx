import { AlertTriangle, CreditCard, FileText, FolderOpen, MessageSquare } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Freshness, MatterRow } from "@/components/portal/matter-parts";
import { EmptyState, PageHeader, SectionCard, StatCard, ViewAllLink } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatDate, formatMoney, formatRelative } from "@/lib/format";
import { requireClientSession } from "@/server/auth/session";
import { getDashboardCounts, getMostUrgentAction } from "@/server/services/dashboard";
import { listMatters, mattersRequiringAction } from "@/server/services/matter";
import { listConversations } from "@/server/services/messaging";

export default async function DashboardPage({ params }: PageProps<"/[locale]/portal">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireClientSession(locale, `/${locale}/portal`);
  const [t, counts, action, matters, actionSet, conversations] = await Promise.all([
    getTranslations("portal"),
    getDashboardCounts(),
    getMostUrgentAction(),
    listMatters("all"),
    mattersRequiringAction(),
    listConversations({ limit: 3 }),
  ]);
  const recent = matters.slice(0, 3);
  const isMock = matters.some((m) => m.is_mock);
  const lastSync =
    matters
      .map((m) => m.last_synced_at)
      .filter(Boolean)
      .sort()
      .at(0) ?? null;

  const actionText = action
    ? action.kind === "signature"
      ? t("dashboard.actionSignature", { title: action.title })
      : action.kind === "request"
        ? t("dashboard.actionRequest", { title: action.title })
        : t("dashboard.actionInvoice", { title: action.title })
    : null;
  const actionDue = action?.dueAt
    ? t("dashboard.actionDue", {
        date:
          action.dueAt.length === 10
            ? formatCalendarDate(action.dueAt, locale)
            : formatDate(action.dueAt, locale),
      })
    : null;

  return (
    <>
      <PageHeader
        title={
          profile.first_name ? t("dashboard.title", { name: profile.first_name }) : t("dashboard.titleNoName")
        }
        subtitle={t("dashboard.subtitle")}
        actions={
          <>
            {isMock ? <DemoDataBadge /> : null}
            <Freshness at={lastSync} />
          </>
        }
      />

      {action ? (
        <div
          role="status"
          className="mb-8 flex flex-col gap-4 rounded-[4px] border border-gold bg-gold-pale p-5 sm:flex-row sm:items-center"
        >
          <AlertTriangle aria-hidden className="size-5 shrink-0 text-gold-ink" />
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-gold-ink uppercase">
              {t("dashboard.actionRequired")}
            </p>
            <p className="mt-1 text-sm text-marine">
              <strong>{actionText}</strong>
              {actionDue ? ` — ${actionDue}` : ""}
            </p>
          </div>
          <Button asChild variant="primary" size="brand">
            <Link href={action.href}>{t("dashboard.actionCta")} →</Link>
          </Button>
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dashboard.cards.activeMatters")}
          value={String(counts.activeMatters)}
          icon={FolderOpen}
          tone="gold"
          href="/portal/matters"
        />
        <StatCard
          label={t("dashboard.cards.pendingDocuments")}
          value={String(counts.pendingDocuments)}
          icon={FileText}
          tone="blue"
          href="/portal/documents"
        />
        <StatCard
          label={t("dashboard.cards.unreadMessages")}
          value={String(counts.unreadMessages)}
          icon={MessageSquare}
          tone="marine"
          href="/portal/messages"
        />
        <StatCard
          label={t("dashboard.cards.outstanding")}
          value={formatMoney(counts.outstandingBalance, locale)}
          icon={CreditCard}
          tone="red"
          href="/portal/billing"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard
          title={t("dashboard.recentMatters")}
          action={<ViewAllLink href="/portal/matters" />}
          className="lg:col-span-3"
        >
          {recent.length === 0 ? (
            <EmptyState icon={FolderOpen} message={t("dashboard.noMatters")} />
          ) : (
            <ul className="space-y-3">
              {recent.map((m) => (
                <li key={m.id}>
                  <MatterRow matter={m} actionRequired={actionSet.has(m.id)} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t("dashboard.recentMessages")}
          action={<ViewAllLink href="/portal/messages" />}
          className="lg:col-span-2"
        >
          {conversations.length === 0 ? (
            <EmptyState icon={MessageSquare} message={t("dashboard.noMessages")} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/portal/messages/${c.id}`}
                    className={`-mx-2 flex gap-3 rounded-[2px] px-2 py-3 hover:bg-surface ${c.unread ? "bg-gold-pale/40" : ""}`}
                  >
                    {c.unread ? (
                      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-marine">
                          {c.subject ?? c.matters?.display_number}
                          {c.unread ? <span className="sr-only"> — {t("messages.unread")}</span> : null}
                        </span>
                        {c.lastMessage ? (
                          <span className="shrink-0 text-xs text-ink-muted">
                            {formatRelative(c.lastMessage.created_at, locale)}
                          </span>
                        ) : null}
                      </span>
                      {c.lastMessage ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">
                          {c.lastMessage.body}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
