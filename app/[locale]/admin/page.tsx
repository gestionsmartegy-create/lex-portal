import { FileSignature, FileText, Gavel, MessageSquare, PackageCheck, RefreshCw } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WatchlistPanel } from "./_components/watchlist-panel";
import { SectionCard } from "@/components/portal/ui";
import { HelpTip } from "@/components/shared/help-tip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatRelative } from "@/lib/format";
import { formatZoned } from "@/lib/zoned-time";
import { courtDateStatusAction } from "@/server/actions/court-dates";
import { requireStaff } from "@/server/auth/session";
import { getMyDay } from "@/server/services/my-day";

const rowClass = "flex flex-wrap items-center gap-3 py-3";
/** Noms des clients d'un fil : sans doublon, deux au plus (« + 3 »). */
const names = (list: string[]) => {
  const unique = [...new Set(list.filter(Boolean))];
  return unique.length > 2 ? `${unique.slice(0, 2).join(", ")} + ${unique.length - 2}` : unique.join(", ");
};
const actionLink =
  "inline-flex h-9 items-center rounded-[8px] border border-gray-300 bg-white px-3.5 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none";

/**
 * « Ma journée » (ADR 0033) : l'accueil de l'espace cabinet montre ce qui attend la personne —
 * audiences, dates à confirmer, messages sans réponse, documents reçus, retards, contrats en relecture —
 * chaque ligne menant à l'endroit où agir. Données lues sous sa session (RLS).
 */
export default async function MyDayPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireStaff(locale);
  const [t, tCourt, day] = await Promise.all([
    getTranslations("admin.myDay"),
    getTranslations("admin.court"),
    getMyDay(),
  ]);
  if (!day) return null;
  const name = profile.first_name ?? "";
  const today = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "full",
    timeZone: "America/Halifax",
  }).format(new Date());
  const counters = [
    { key: "thisWeek", value: day.upcoming.length, tone: "plain", href: "/admin/court-calendar?view=list" },
    {
      key: "toConfirm",
      value: day.toConfirm,
      tone: "warning",
      href: "/admin/court-calendar?view=list&status=to_confirm",
    },
    { key: "unread", value: day.unreadTotal, tone: "plain", href: "/admin/messages" },
    { key: "late", value: day.lateTotal, tone: "urgent", href: "/admin/requests?status=overdue" },
  ] as const;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[28px] leading-tight font-extrabold text-marine">
          {name ? t("hello", { name }) : t("helloNoName")}
        </h1>
        <p className="mt-1 text-sm text-ink-muted first-letter:uppercase">{t("today", { date: today })}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className={`rounded-[8px] border bg-white p-4 hover:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none ${
              c.tone === "warning" && c.value > 0
                ? "border-status-warning/50"
                : c.tone === "urgent" && c.value > 0
                  ? "border-status-urgent/40"
                  : "border-gray-200"
            }`}
          >
            <span
              className={`block font-display text-3xl font-extrabold ${
                c.tone === "warning" && c.value > 0
                  ? "text-warning-ink"
                  : c.tone === "urgent" && c.value > 0
                    ? "text-[#B91C1C]"
                    : "text-marine"
              }`}
            >
              {c.value}
            </span>
            <span className="text-sm text-ink-muted">{t(`counters.${c.key}`, { count: c.value })}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard
            title={t("hearings")}
            help={<HelpTip label={t("hearingsHelpLabel")}>{t("hearingsHelp")}</HelpTip>}
            action={
              <Link href="/admin/court-calendar" className="text-sm text-gold-ink hover:underline">
                {t("openCalendar")}
              </Link>
            }
          >
            {day.upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noHearings")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {day.upcoming.slice(0, 8).map((i) => (
                  <li key={i.id} className={rowClass}>
                    <div className="min-w-0 flex-1 basis-64">
                      {i.onTeam ? (
                        <Link
                          href={`/admin/matters/${i.matterId}?tab=court`}
                          className="font-semibold text-marine hover:underline"
                        >
                          {tCourt(`kinds.${i.kind}`)} ·{" "}
                          {i.matterNumber || i.matterTitle || t("unnamedMatter")}
                        </Link>
                      ) : (
                        <span className="font-semibold text-marine">
                          {tCourt(`kinds.${i.kind}`)} · {i.matterNumber || t("unnamedMatter")}
                        </span>
                      )}
                      <p className="text-sm text-ink-muted">
                        {formatZoned(i.startsAt, i.timezone, locale, i.allDay)}
                      </p>
                      {i.conflict ? (
                        <p className="text-sm text-[#B91C1C]">
                          {i.busyConflict ? t("busyConflict") : t("conflict")}
                        </p>
                      ) : null}
                    </div>
                    {i.conflict ? (
                      <StatusBadge tone="urgent" label={t("conflictBadge")} />
                    ) : i.status === "scheduled" ? (
                      <StatusBadge tone="warning" label={t("toConfirmBadge")} />
                    ) : (
                      <StatusBadge tone="completed" label={t("confirmedBadge")} />
                    )}
                    {i.status === "scheduled" && i.onTeam ? (
                      <form action={courtDateStatusAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="matterId" value={i.matterId} />
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value="confirmed" />
                        <Button type="submit" variant="primary" size="sm">
                          {t("confirm")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t("toHandle")}>
            {day.unread.length +
              day.documents.length +
              day.late.length +
              day.contracts.length +
              day.failedDeposits.length +
              day.clioChanges.length ===
            0 ? (
              <p className="text-sm text-ink-muted">{t("nothingToHandle")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {day.unread.map((c) => (
                  <li key={`m-${c.id}`} className={rowClass}>
                    <MessageSquare aria-hidden className="size-4 shrink-0 text-gold-ink" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-marine">
                        {t("message", { from: names(c.clients) || t("client") })}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {[
                          c.subject,
                          c.matter?.display_number,
                          c.last_message_at ? formatRelative(c.last_message_at, locale) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Link href={`/admin/messages/${c.id}`} className={actionLink}>
                      {t("reply")}
                    </Link>
                  </li>
                ))}
                {day.documents.map((d) => (
                  <li key={`d-${d.id}`} className={rowClass}>
                    <FileText aria-hidden className="size-4 shrink-0 text-gold-ink" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold break-words text-marine">
                        {t("document", { name: d.name })}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {[d.matterNumber, formatRelative(d.at, locale)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Link href={`/admin/matters/${d.matterId}?tab=documents`} className={actionLink}>
                      {t("check")}
                    </Link>
                  </li>
                ))}
                {day.late.map((l) => (
                  <li key={`l-${l.id}`} className={rowClass}>
                    <PackageCheck aria-hidden className="size-4 shrink-0 text-[#B91C1C]" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-marine">
                        {t(l.kind === "request" ? "lateRequest" : "lateDeliverable", {
                          title: locale === "en" && l.title_en ? l.title_en : l.title,
                        })}
                      </p>
                      <p className="text-sm text-[#B91C1C]">
                        {[
                          l.matterNumber,
                          l.date ? t("dueOn", { date: formatCalendarDate(l.date, locale) }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={`/admin/matters/${l.matterId}${l.kind === "request" ? "?tab=documents" : "?tab=steps"}`}
                      className={actionLink}
                    >
                      {t("open")}
                    </Link>
                  </li>
                ))}
                {day.contracts.map((c) => (
                  <li key={`c-${c.id}`} className={rowClass}>
                    <FileSignature aria-hidden className="size-4 shrink-0 text-gold-ink" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-marine">{t("contractReview", { title: c.title })}</p>
                      <p className="text-sm text-ink-muted">
                        {[c.clientName, c.author].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Link href={`/admin/contracts/${c.id}`} className={actionLink}>
                      {t("review")}
                    </Link>
                  </li>
                ))}
                {day.failedDeposits.map((d) => (
                  <li key={`d-${d.id}`} className={rowClass}>
                    <RefreshCw aria-hidden className="size-4 shrink-0 text-warning-ink" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-marine">
                        {t("depositFailed", { title: d.title, version: d.version })}
                      </p>
                    </div>
                    <Link href={`/admin/contracts/${d.contractId}`} className={actionLink}>
                      {t("open")}
                    </Link>
                  </li>
                ))}
                {day.clioChanges.map((i) => (
                  <li key={`k-${i.id}`} className={rowClass}>
                    <RefreshCw aria-hidden className="size-4 shrink-0 text-warning-ink" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-marine">
                        {t(i.clioChange === "deleted" ? "clioMissing" : "clioMoved", {
                          matter: i.matterNumber || i.matterTitle || t("unnamedMatter"),
                        })}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {formatZoned(i.startsAt, i.timezone, locale, i.allDay)}
                      </p>
                    </div>
                    {i.onTeam ? (
                      <Link href={`/admin/matters/${i.matterId}?tab=court`} className={actionLink}>
                        {t("check")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {day.watch ? <WatchlistPanel data={day.watch} locale={locale} /> : null}
        </div>

        <aside className="space-y-6">
          <SectionCard title={t("create")}>
            <div className="flex flex-col gap-2.5">
              <Button asChild variant="primary" size="brand">
                <Link href="/admin/contracts/new">{t("newContract")}</Link>
              </Button>
              {day.isAdmin ? (
                <Button asChild variant="outline-marine" size="brand">
                  <Link href="/admin/matters/new">{t("newMatter")}</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline-marine" size="brand">
                <Link href="/admin/matters">{t("addCourtDate")}</Link>
              </Button>
              {day.isAdmin ? (
                <Button asChild variant="outline-marine" size="brand">
                  <Link href="/admin/invitations">{t("inviteClient")}</Link>
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {day.isAdmin ? (
            <SectionCard
              title={t("activity")}
              action={
                <Link href="/admin/audit" className="text-sm text-gold-ink hover:underline">
                  {t("seeAll")}
                </Link>
              }
            >
              {day.activity.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noActivity")}</p>
              ) : (
                <ul className="space-y-3">
                  {day.activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <p className="text-marine">
                        <Gavel aria-hidden className="mr-1.5 inline size-3.5 text-gold-ink" />
                        {t.has(`actions.${a.action.replaceAll(".", "_")}`)
                          ? t(`actions.${a.action.replaceAll(".", "_")}`, { actor: a.actor ?? t("system") })
                          : t("actions.other", { actor: a.actor ?? t("system") })}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {[a.matterNumber, formatRelative(a.at, locale)].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </>
  );
}
