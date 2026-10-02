import { Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { setClientStatusAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { listClients } from "@/server/services/admin";

const TONE: Record<string, StatusTone> = {
  active: "completed",
  invited: "pending",
  suspended: "urgent",
  disabled: "urgent",
};

export default async function ClientsPage({ params, searchParams }: PageProps<"/[locale]/admin/clients">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const [t, clients] = await Promise.all([getTranslations("admin"), listClients()]);
  const notice =
    sp.notice === "suspended"
      ? t("clients.suspended")
      : sp.notice === "reactivated"
        ? t("clients.reactivated")
        : sp.notice === "failed"
          ? t("errors.FAILED")
          : undefined;

  return (
    <>
      <PageHeader title={t("clients.title")} subtitle={t("clients.subtitle")} />
      <Notice message={notice} error={sp.notice === "failed"} />
      <SectionCard>
        {clients.length === 0 ? (
          <EmptyState icon={Users} message={t("clients.none")} />
        ) : (
          <div
            className="-mx-5 overflow-x-auto sm:-mx-6"
            role="region"
            aria-label={t("clients.title")}
            tabIndex={0}
          >
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 text-xs text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    {t("clients.name")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    {t("clients.status")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    {t("clients.matters")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    {t("clients.lastSeen")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                    {t("clients.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 sm:px-6">
                      <p className="font-medium text-marine">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-xs text-ink-muted">{c.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        tone={TONE[c.status] ?? "pending"}
                        label={t(`clients.statusLabels.${c.status}`)}
                      />
                    </td>
                    <td className="px-3 py-3 text-marine tabular-nums">{c.matterCount}</td>
                    <td className="px-3 py-3 text-xs text-ink-muted">
                      {c.last_seen_at ? formatRelative(c.last_seen_at, locale) : t("clients.never")}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <div className="flex justify-end gap-2">
                        {c.status === "active" || c.status === "suspended" ? (
                          <form action={setClientStatusAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="status"
                              value={c.status === "active" ? "suspended" : "active"}
                            />
                            <Button
                              type="submit"
                              variant={c.status === "active" ? "outline-gold" : "primary"}
                              size="sm"
                            >
                              {c.status === "active" ? t("clients.suspend") : t("clients.reactivate")}
                            </Button>
                          </form>
                        ) : null}
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/admin/security/mfa-reset">{t("clients.resetMfa")}</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
