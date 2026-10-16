import { FolderOpen, MailPlus, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourtWatchPanel } from "./_components/court-watch-panel";
import { WatchlistPanel } from "./_components/watchlist-panel";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { getAdminOverview, listAuditEvents } from "@/server/services/admin";
import { getCourtWatch } from "@/server/services/court-calendar";
import { getWatchlist } from "@/server/services/matter-board";

export default async function AdminHome({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const isAdmin = role === "firm_admin";
  const [t, overview, watch, court, events] = await Promise.all([
    getTranslations("admin.overview"),
    getAdminOverview(),
    getWatchlist(),
    getCourtWatch(),
    isAdmin ? listAuditEvents({ limit: 8 }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {isAdmin ? (
          <StatCard
            label={t("pendingInvitations")}
            value={String(overview.pendingInvitations)}
            icon={MailPlus}
            tone="gold"
            href="/admin/invitations"
          />
        ) : null}
        {isAdmin ? (
          <StatCard
            label={t("activeClients")}
            value={String(overview.activeClients)}
            icon={Users}
            tone="blue"
            href="/admin/clients"
          />
        ) : null}
        <StatCard
          label={t("openMatters")}
          value={String(overview.openMatters)}
          icon={FolderOpen}
          tone="marine"
          href="/admin/matters"
        />
      </div>
      {court ? <CourtWatchPanel data={court} locale={locale} /> : null}
      {watch ? <WatchlistPanel data={watch} locale={locale} /> : null}
      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard title={t("recentEvents")} className="lg:col-span-2">
            {events.length === 0 ? (
              <EmptyState icon={FolderOpen} message={t("noEvents")} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {events.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="font-mono text-xs text-marine">{e.action}</span>
                    <span className="text-xs text-ink-muted">{formatRelative(e.occurred_at, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={t("quick")}>
            <div className="flex flex-col gap-3">
              <Button asChild variant="primary" size="brand">
                <Link href="/admin/invitations">{t("inviteClient")}</Link>
              </Button>
              <Button asChild variant="outline-gold" size="brand">
                <Link href="/admin/matters">{t("manageAccess")}</Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("staffOnly")}</p>
      )}
    </>
  );
}
