import { PlugZap } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClioImportForm } from "@/components/admin/clio-import-form";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative } from "@/lib/format";
import { disconnectClioAction, importClioContactAction, syncClioNowAction } from "@/server/actions/admin";
import { cutCalendarAction } from "@/server/actions/calendar";
import { courtCalendarAction } from "@/server/actions/court-dates";
import { listCalendarConnections } from "@/server/services/calendar-connections";
import { getCourtCalendarSetting, listClioCalendars } from "@/server/services/court-dates";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/env";

const TONE: Record<string, StatusTone> = {
  connected: "completed",
  not_configured: "pending",
  error: "urgent",
  revoked: "pending",
};
const NOTICES = ["connected", "disconnected", "synced", "calendarSaved", "calendarCut", "failed"] as const;

export default async function IntegrationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/integrations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const live = serverEnv().INTEGRATION_MODE_CLIO === "live";
  const supabase = await createSupabaseServerClient();
  const [t, { data: connections }] = await Promise.all([
    getTranslations("admin.integrations"),
    supabase.rpc("integration_status_list"),
  ]);
  const clio = (connections ?? []).find((c) => c.provider === "clio_manage" && c.region === "ca");
  const status = live ? (clio?.status ?? "not_configured") : "connected";
  const notice = NOTICES.find((n) => n === sp.notice);
  // Calendriers Clio où l'on peut écrire (seulement si la connexion est active).
  const [courtCalendar, calendars, outlook] = await Promise.all([
    getCourtCalendarSetting(),
    status === "connected" ? listClioCalendars() : Promise.resolve({ ok: false as const, calendars: [] }),
    listCalendarConnections(),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice message={notice ? t(`notices.${notice}`) : undefined} error={notice === "failed"} />
      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title={t("clio")} className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <PlugZap aria-hidden className="size-5 text-gold-ink" />
              <StatusBadge tone={TONE[status] ?? "pending"} label={t(`status.${status}`)} />
            </div>
            {!live ? <InfoNote>{t("mockMode")}</InfoNote> : null}
            {live && clio?.connected_at ? (
              <p className="text-xs text-ink-muted">
                {t("connectedOn", { date: formatDate(clio.connected_at, locale) })}
              </p>
            ) : null}
            <p className="text-xs text-ink-muted">
              {clio?.last_sync_at
                ? t("lastSync", { time: formatRelative(clio.last_sync_at, locale) })
                : t("neverSynced")}
            </p>
            <div className="flex flex-wrap gap-3">
              {live && status !== "connected" ? (
                <Button asChild variant="primary" size="brand">
                  {/* Route serveur : redirection vers Clio (PKCE + state), navigation complète. */}
                  <a href={`/api/integrations/clio/connect?locale=${locale}`}>{t("connect")}</a>
                </Button>
              ) : null}
              {status === "connected" ? (
                <form action={syncClioNowAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" variant="outline-gold" size="brand">
                    {t("syncNow")}
                  </Button>
                </form>
              ) : null}
              {live && status === "connected" ? (
                <form action={disconnectClioAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" variant="ghost" size="brand">
                    {t("disconnect")}
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </SectionCard>
        <SectionCard title={t("importTitle")} className="lg:col-span-3">
          <ClioImportForm action={importClioContactAction} locale={locale} />
        </SectionCard>
        <SectionCard title={t("courtCalendar.title")} className="lg:col-span-5">
          <p className="mb-3 text-sm text-ink-muted">{t("courtCalendar.help")}</p>
          {status !== "connected" ? (
            <InfoNote>{t("courtCalendar.notConnected")}</InfoNote>
          ) : !calendars.ok ? (
            <InfoNote>{t("courtCalendar.unavailable")}</InfoNote>
          ) : (
            <form action={courtCalendarAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <div className="w-full space-y-1 sm:w-80">
                <label
                  htmlFor="court-calendar"
                  className="text-xs font-semibold tracking-[0.05em] text-marine uppercase"
                >
                  {t("courtCalendar.label")}
                </label>
                <select
                  id="court-calendar"
                  name="calendarId"
                  defaultValue={courtCalendar ? String(courtCalendar) : ""}
                  className="h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
                >
                  <option value="">{t("courtCalendar.none")}</option>
                  {calendars.calendars.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name ?? `#${c.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="outline-gold" size="sm" className="h-10">
                {t("courtCalendar.save")}
              </Button>
            </form>
          )}
        </SectionCard>
        <SectionCard title={t("outlook.title")} className="lg:col-span-5">
          <p className="mb-3 text-sm text-ink-muted">{t("outlook.help")}</p>
          {!outlook?.length ? (
            <p className="text-sm text-ink-muted">{t("outlook.none")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {outlook.map((c) => (
                <li key={c.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-marine">
                      {[c.title, c.first_name, c.last_name].filter(Boolean).join(" ") || t("outlook.unnamed")}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t(`outlook.status.${c.status === "connected" ? "connected" : "needsReconnect"}`)}
                      {c.is_mock ? ` · ${t("outlook.simulator")}` : ""}
                      {" · "}
                      {c.last_sync_at
                        ? t("lastSync", { time: formatRelative(c.last_sync_at, locale) })
                        : t("neverSynced")}
                      {c.reminders_enabled ? ` · ${t("outlook.reminders")}` : ""}
                    </p>
                  </div>
                  <form action={cutCalendarAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="userId" value={c.user_id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("outlook.cut")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
