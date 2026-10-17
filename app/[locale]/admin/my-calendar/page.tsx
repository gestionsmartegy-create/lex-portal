import { CalendarClock, EyeOff, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative } from "@/lib/format";
import {
  connectCalendarAction,
  disconnectCalendarAction,
  remindersAction,
  syncCalendarAction,
} from "@/server/actions/calendar";
import { requireStaff } from "@/server/auth/session";
import { getMyCalendarConnection, outlookMode } from "@/server/services/calendar-connections";

const NOTICES = [
  "connected",
  "disconnected",
  "synced",
  "remindersOn",
  "remindersOff",
  "unavailable",
  "failed",
] as const;

// Mon agenda (lot 4, ADR 0031) : connecter son agenda Outlook pour les conflits d'horaire (plages
// occupées seulement) et, au choix, recevoir les rappels de préparation dans l'agenda « Lex Portail ».
export default async function MyCalendarPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/my-calendar">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const [t, connection] = await Promise.all([getTranslations("admin.myCalendar"), getMyCalendarConnection()]);
  const mock = outlookMode() === "mock";
  const notice = NOTICES.find((n) => n === sp.notice);
  const hidden = <input type="hidden" name="locale" value={locale} />;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "unavailable"}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title={t("outlook")} className="lg:col-span-3">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <CalendarClock aria-hidden className="size-5 text-gold-ink" />
              <StatusBadge
                tone={!connection ? "pending" : connection.status === "connected" ? "completed" : "urgent"}
                label={t(`status.${connection?.status ?? "notConnected"}`)}
              />
              {connection?.isMock ? <DemoDataBadge /> : null}
            </div>
            {mock ? <InfoNote>{t("mockMode")}</InfoNote> : null}
            {connection ? (
              <p className="text-xs text-ink-muted">
                {t("connectedOn", { date: formatDate(connection.connectedAt, locale) })} ·{" "}
                {connection.lastSyncAt
                  ? t("lastSync", { time: formatRelative(connection.lastSyncAt, locale) })
                  : t("neverSynced")}
              </p>
            ) : null}
            {connection?.status === "needs_reconnect" ? <InfoNote>{t("reconnectHelp")}</InfoNote> : null}
            <div className="flex flex-wrap gap-3">
              {!connection || connection.status === "needs_reconnect" ? (
                mock ? (
                  <form action={connectCalendarAction}>
                    {hidden}
                    <Button type="submit" variant="primary" size="brand">
                      {connection ? t("reconnect") : t("connect")}
                    </Button>
                  </form>
                ) : (
                  <InfoNote>{t("liveUnavailable")}</InfoNote>
                )
              ) : (
                <form action={syncCalendarAction}>
                  {hidden}
                  <Button type="submit" variant="outline-gold" size="brand">
                    {t("syncNow")}
                  </Button>
                </form>
              )}
              {connection ? (
                <form action={disconnectCalendarAction}>
                  {hidden}
                  <Button type="submit" variant="ghost" size="brand">
                    {t("disconnect")}
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("privacyTitle")} className="lg:col-span-2">
          <ul className="space-y-3 text-sm text-marine">
            <li className="flex gap-2">
              <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-ink" />
              {t("privacyBusy")}
            </li>
            <li className="flex gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-ink" />
              {t("privacyNoCopy")}
            </li>
            <li className="flex gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-ink" />
              {t("privacyControl")}
            </li>
          </ul>
        </SectionCard>

        {connection?.status === "connected" ? (
          <SectionCard title={t("remindersTitle")} className="lg:col-span-5">
            <p className="mb-3 text-sm text-ink-muted">{t("remindersHelp")}</p>
            <form action={remindersAction} className="flex flex-wrap items-center gap-3">
              {hidden}
              <input type="hidden" name="enabled" value={connection.remindersEnabled ? "false" : "true"} />
              <StatusBadge
                tone={connection.remindersEnabled ? "completed" : "pending"}
                label={connection.remindersEnabled ? t("remindersOn") : t("remindersOff")}
              />
              <Button type="submit" variant="outline-gold" size="sm">
                {connection.remindersEnabled ? t("remindersDisable") : t("remindersEnable")}
              </Button>
            </form>
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
