import { AlertTriangle, CalendarClock, Clock3, PackageCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SectionCard } from "@/components/portal/ui";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatRelative } from "@/lib/format";
import type { Watchlist, WatchItem } from "@/server/services/matter-board";
import { pick } from "@/server/services/matter-templates";

/** Panneau « À surveiller » de l'espace cabinet (ADR 0023) : alertes calculées sur les dossiers de ses équipes. */
export async function WatchlistPanel({ data, locale }: { data: Watchlist; locale: string }) {
  const t = await getTranslations("admin.overview.watch");
  const groups: {
    key: keyof Watchlist;
    icon: LucideIcon;
    urgent: boolean;
    href: string | null;
    date: (item: WatchItem) => string;
  }[] = [
    {
      key: "overdueRequests",
      icon: AlertTriangle,
      urgent: true,
      href: "/admin/requests?status=overdue",
      date: (i) => t("dueOn", { date: formatCalendarDate(i.date!, locale) }),
    },
    {
      key: "lateDeliverables",
      icon: PackageCheck,
      urgent: true,
      href: null,
      date: (i) => t("dueOn", { date: formatCalendarDate(i.date!, locale) }),
    },
    {
      key: "soonRequests",
      icon: CalendarClock,
      urgent: false,
      href: "/admin/requests?status=pending",
      date: (i) => t("dueOn", { date: formatCalendarDate(i.date!, locale) }),
    },
    {
      key: "soonDeliverables",
      icon: CalendarClock,
      urgent: false,
      href: null,
      date: (i) => t("dueOn", { date: formatCalendarDate(i.date!, locale) }),
    },
    {
      key: "idleMatters",
      icon: Clock3,
      urgent: false,
      href: "/admin/matters?alert=idle",
      date: (i) => t("lastActivity", { when: formatRelative(i.date!, locale) }),
    },
  ];
  const total = groups.reduce((n, g) => n + data[g.key].total, 0);

  return (
    <SectionCard title={t("title")} className="mb-8">
      {total === 0 ? (
        <p className="text-sm text-ink-muted">{t("none")}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {groups
            .filter((g) => data[g.key].total > 0)
            .map((g) => {
              const Icon = g.icon;
              const group = data[g.key];
              return (
                <section key={g.key} aria-labelledby={`watch-${g.key}`}>
                  <h3
                    id={`watch-${g.key}`}
                    className={`mb-2 flex items-center gap-2 text-sm font-bold ${
                      g.urgent ? "text-destructive" : "text-marine"
                    }`}
                  >
                    <Icon aria-hidden className="size-4" />
                    {t(`groups.${g.key}`, { count: group.total })}
                  </h3>
                  <ul className="divide-y divide-gray-100">
                    {group.items.map((item) => (
                      <li key={item.id} className="py-2 text-sm">
                        <Link
                          href={`/admin/matters/${item.matterId}`}
                          className="font-medium text-marine hover:underline"
                        >
                          {g.key === "idleMatters"
                            ? item.matterTitle
                            : pick(locale, item.title, item.title_en)}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {[
                            g.key === "idleMatters" ? null : (item.matterNumber ?? item.matterTitle),
                            g.date(item),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {g.href && group.total > group.items.length ? (
                    <Link
                      href={g.href}
                      className="mt-1 inline-flex min-h-6 items-center text-sm text-gold-ink hover:underline"
                    >
                      {t("seeAll", { count: group.total })}
                    </Link>
                  ) : null}
                </section>
              );
            })}
        </div>
      )}
    </SectionCard>
  );
}
