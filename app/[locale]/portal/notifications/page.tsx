import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/server/actions/portal";
import { requireClientSession } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notification";

const ICONS = { urgent: AlertTriangle, info: Info, success: CheckCircle2 } as const;
const TONES = { urgent: "text-danger-ink", info: "text-info-ink", success: "text-success-ink" } as const;

export default async function NotificationsPage({ params }: PageProps<"/[locale]/portal/notifications">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/notifications`);
  const [t, notifications] = await Promise.all([
    getTranslations("portal.notifications"),
    listNotifications(),
  ]);
  const unread = notifications.some((n) => !n.read_at);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          unread ? (
            <form action={markAllNotificationsReadAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline-gold" size="brand">
                {t("markAll")}
              </Button>
            </form>
          ) : null
        }
      />
      <SectionCard>
        {notifications.length === 0 ? (
          <EmptyState icon={Bell} message={t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => {
              const priority = (n.priority in ICONS ? n.priority : "info") as keyof typeof ICONS;
              const Icon = ICONS[priority];
              const matter = n.matters as unknown as { display_number: string | null } | null;
              const href = internalPortalHref(n.action_url);
              return (
                <li key={n.id} className={`flex gap-3 py-4 ${n.read_at ? "" : "-mx-2 bg-gold-pale/30 px-2"}`}>
                  <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${TONES[priority]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-marine">
                      {n.title}
                      {!n.read_at ? <span className="sr-only"> — {t("unread")}</span> : null}
                    </p>
                    {n.body ? <p className="text-sm text-ink-muted">{n.body}</p> : null}
                    <p className="mt-1 text-xs text-ink-muted">
                      {[formatRelative(n.created_at, locale), matter?.display_number]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {href ? (
                      <Link
                        href={href}
                        className="inline-flex min-h-6 items-center text-xs font-medium text-gold-ink hover:underline"
                      >
                        {t("open")} →
                      </Link>
                    ) : null}
                    {!n.read_at ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <button
                          type="submit"
                          className="inline-flex min-h-6 items-center text-xs text-ink-muted hover:text-marine"
                        >
                          ✓ {t("markRead")}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

/** Lien interne au portail uniquement (jamais d'URL externe venue de la base, AGENTS.md §7). */
function internalPortalHref(value: string | null): string | null {
  if (!value || !/^\/portal(\/[A-Za-z0-9_-]+)*\/?(\?[A-Za-z0-9_=&-]*)?$/.test(value)) return null;
  return value;
}
