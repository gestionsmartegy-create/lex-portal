import {
  CheckCircle2,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  Gavel,
  MessageSquare,
  PenLine,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MatterRow } from "@/components/portal/matter-parts";
import { EmptyState, PageHeader, SectionCard, ViewAllLink } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatDate, formatMoney, formatRelative } from "@/lib/format";
import { formatZoned } from "@/lib/zoned-time";
import { requireClientSession } from "@/server/auth/session";
import { listClientCourtDates } from "@/server/services/client-court-dates";
import { listClientTodos } from "@/server/services/dashboard";
import { listMatters, mattersRequiringAction } from "@/server/services/matter";
import { listConversations } from "@/server/services/messaging";

const TODO_ICON = {
  signature: PenLine,
  request: FileText,
  invoice: CreditCard,
  contract: FileSignature,
} as const;

/**
 * Accueil du portail client (ADR 0033) : d'abord « Ce que vous devez faire » (signatures, documents
 * demandés, factures), puis l'avancement de ses dossiers, la prochaine audience et les derniers messages.
 * Aucun vocabulaire technique (synchronisation, statuts internes).
 */
export default async function DashboardPage({ params }: PageProps<"/[locale]/portal">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireClientSession(locale, `/${locale}/portal`);
  const [t, todos, matters, actionSet, conversations, courtDates] = await Promise.all([
    getTranslations("portal"),
    listClientTodos(),
    listMatters("all"),
    mattersRequiringAction(),
    listConversations({ limit: 3 }),
    listClientCourtDates(),
  ]);
  const recent = matters.slice(0, 3);
  const isMock = matters.some((m) => m.is_mock);
  const next = courtDates[0];
  const due = (d: string | null) =>
    d
      ? t("home.dueOn", { date: d.length === 10 ? formatCalendarDate(d, locale) : formatDate(d, locale) })
      : null;

  return (
    <>
      <PageHeader
        title={
          profile.first_name ? t("dashboard.title", { name: profile.first_name }) : t("dashboard.titleNoName")
        }
        subtitle={t("home.subtitle")}
        actions={isMock ? <DemoDataBadge /> : null}
      />

      <section aria-labelledby="todo-title" className="mb-8 rounded-[8px] border border-gold/50 bg-white">
        <div className="rounded-t-[8px] border-b border-gold/30 bg-cream px-5 py-4 sm:px-6">
          <h2 id="todo-title" className="font-display text-xl font-bold text-marine">
            {t("home.todoTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {todos.length ? t("home.todoCount", { count: todos.length }) : t("home.todoNone")}
          </p>
        </div>
        {todos.length ? (
          <ul className="divide-y divide-gray-100 px-5 sm:px-6">
            {todos.map((item) => {
              const Icon = TODO_ICON[item.kind];
              const detail =
                item.kind === "invoice"
                  ? [formatMoney(item.amount, locale), due(item.dueAt)].filter(Boolean).join(" · ")
                  : item.kind === "request"
                    ? [item.matter, due(item.dueAt)].filter(Boolean).join(" · ")
                    : due(item.dueAt);
              return (
                <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-3 py-4">
                  <Icon aria-hidden className="size-5 shrink-0 text-gold-ink" />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-semibold break-words text-marine">
                      {t(`home.todo.${item.kind}`, { title: item.title })}
                    </p>
                    {detail ? (
                      <p
                        className={
                          item.kind === "invoice" && item.overdue
                            ? "text-sm text-[#B91C1C]"
                            : "text-sm text-ink-muted"
                        }
                      >
                        {detail}
                      </p>
                    ) : null}
                  </div>
                  <Button asChild variant="primary" size="brand" className="h-11 px-5">
                    <Link href={item.href}>{t(`home.cta.${item.kind}`)}</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-5 py-5 text-sm text-marine sm:px-6">
            <CheckCircle2 aria-hidden className="size-5 text-status-completed" />
            {t("home.allDone")}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard
          title={t("home.yourMatters")}
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

        <div className="space-y-6 lg:col-span-2">
          <SectionCard title={t("home.nextHearing")}>
            {next ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-start gap-2 font-semibold text-marine">
                  <Gavel aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-ink" />
                  {formatZoned(next.starts_at, next.timezone, locale, next.all_day)}
                </p>
                <p className="text-ink-muted">
                  {[
                    locale === "fr" ? next.court_name_fr : next.court_name_en,
                    next.room ? t("home.room", { room: next.room }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {next.client_instructions ? (
                  <p className="rounded-[8px] border border-gold/40 bg-cream p-3 whitespace-pre-line text-marine">
                    <strong>{t("home.instructions")}</strong> {next.client_instructions}
                  </p>
                ) : null}
                <Link href="/portal/appointments" className="inline-flex text-gold-ink hover:underline">
                  {t("home.seeAppointments")}
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{t("home.noHearing")}</p>
            )}
          </SectionCard>

          <SectionCard title={t("dashboard.recentMessages")} action={<ViewAllLink href="/portal/messages" />}>
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
      </div>
    </>
  );
}
