import { PlugZap } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClioImportForm } from "@/components/admin/clio-import-form";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative } from "@/lib/format";
import { disconnectClioAction, importClioContactAction, syncClioNowAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/env";

const TONE: Record<string, StatusTone> = {
  connected: "completed",
  not_configured: "pending",
  error: "urgent",
  revoked: "pending",
};
const NOTICES = ["connected", "disconnected", "synced", "failed"] as const;

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
      </div>
    </>
  );
}
