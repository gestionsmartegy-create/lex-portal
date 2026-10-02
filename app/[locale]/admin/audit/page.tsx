import { ScrollText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listAuditEvents } from "@/server/services/admin";

const PAGE = 50;

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const before =
    typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const [t, events] = await Promise.all([
    getTranslations("admin.audit"),
    listAuditEvents({ before, limit: PAGE }),
  ]);
  const last = events.at(-1);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SectionCard>
        {events.length === 0 ? (
          <EmptyState icon={ScrollText} message={t("none")} />
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6" role="region" aria-label={t("title")} tabIndex={0}>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 text-xs text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    {t("when")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    {t("action")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    {t("actor")}
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    {t("resource")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2 text-xs whitespace-nowrap text-ink-muted sm:px-6">
                      {formatDateTime(e.occurred_at, locale)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-marine">{e.action}</td>
                    <td className="px-3 py-2 text-xs text-marine">
                      {e.actor_email ?? (e.actor_id ? e.actor_id.slice(0, 8) : t("system"))}
                      {e.actor_role ? <span className="text-ink-muted"> · {e.actor_role}</span> : null}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs text-ink-muted sm:px-6">
                      {e.resource_type}
                      {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {events.length === PAGE && last ? (
        <div className="mt-4 flex justify-end">
          <Button asChild variant="outline-gold" size="brand">
            <Link href={`/admin/audit?before=${encodeURIComponent(last.occurred_at)}`}>{t("older")} →</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
