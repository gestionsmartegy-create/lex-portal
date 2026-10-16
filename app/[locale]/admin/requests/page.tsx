import { FileQuestion } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate } from "@/lib/format";
import { bulkRequestsAction } from "@/server/actions/requests";
import { requireStaff } from "@/server/auth/session";
import { listAllRequests, requestFiltersSchema } from "@/server/services/document-requests";
import { listTags } from "@/server/services/matter-tags";
import { listOffices } from "@/server/services/offices";
import { pick } from "@/server/services/matter-templates";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const STATUSES = ["pending", "overdue", "fulfilled", "cancelled"] as const;
const NOTICES = ["fulfilled", "cancelled", "remind", "created", "invalid"] as const;
const count = z.coerce.number().int().min(0).max(10_000).catch(0);

/** Toutes les demandes de documents des dossiers de l'utilisateur (ADR 0022). RLS : ses équipes. */
export default async function RequestsPage({ params, searchParams }: PageProps<"/[locale]/admin/requests">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const filters = requestFiltersSchema.parse({
    status: sp.status || undefined,
    tag: sp.tag || undefined,
    office: sp.office || undefined,
    q: sp.q || undefined,
  });
  const [t, rows, tags, offices] = await Promise.all([
    getTranslations("admin.requests"),
    listAllRequests(filters),
    listTags(),
    listOffices(),
  ]);
  const notice = NOTICES.find((n) => n === sp.notice);
  const report = {
    done: count.parse(sp.done),
    failed: count.parse(sp.failed),
    skipped: count.parse(sp.skipped),
  };
  const person = (p: { first_name: string | null; last_name: string | null; email: string } | null) =>
    p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : "—";

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/admin/requests/new">{t("bulkCreate")}</Link>
          </Button>
        }
      />
      <Notice
        message={
          notice === "invalid"
            ? t("notices.invalid")
            : notice
              ? t("notices.report", { action: t(`actions.${notice}`), ...report })
              : undefined
        }
        error={notice === "invalid" || report.failed > 0}
      />

      <SectionCard className="mb-6">
        <form
          method="get"
          action={`/${locale}/admin/requests`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="space-y-1">
            <label htmlFor="r-q" className={labelClass}>
              {t("filters.q")}
            </label>
            <input id="r-q" name="q" defaultValue={filters.q ?? ""} maxLength={100} className={fieldClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="r-status" className={labelClass}>
              {t("filters.status")}
            </label>
            <select id="r-status" name="status" defaultValue={filters.status ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t(`status.${st}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="r-tag" className={labelClass}>
              {t("filters.tag")}
            </label>
            <select id="r-tag" name="tag" defaultValue={filters.tag ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {tags.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {pick(locale, tg.name_fr, tg.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="r-office" className={labelClass}>
              {t("filters.office")}
            </label>
            <select id="r-office" name="office" defaultValue={filters.office ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {pick(locale, o.name_fr, o.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="primary" size="sm">
              {t("filters.apply")}
            </Button>
            <span className="text-sm text-ink-muted">{t("filters.count", { count: rows.length })}</span>
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        {rows.length === 0 ? (
          <EmptyState icon={FileQuestion} message={t("none")} />
        ) : (
          <form action={bulkRequestsAction}>
            <input type="hidden" name="locale" value={locale} />
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            {filters.tag ? <input type="hidden" name="tag" value={filters.tag} /> : null}
            {filters.office ? <input type="hidden" name="office" value={filters.office} /> : null}
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="bulk-action" className={labelClass}>
                  {t("bulkLabel")}
                </label>
                <select
                  id="bulk-action"
                  name="action"
                  defaultValue="remind"
                  className={`${fieldClass} w-auto`}
                >
                  <option value="remind">{t("actions.remind")}</option>
                  <option value="fulfilled">{t("actions.fulfilled")}</option>
                  <option value="cancelled">{t("actions.cancelled")}</option>
                </select>
              </div>
              <Button type="submit" variant="outline-gold" size="sm" className="h-10">
                {t("bulkApply")}
              </Button>
            </div>
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => {
                const shown = r.overdue ? "overdue" : r.status;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <input
                      id={`req-${r.id}`}
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      className="size-5 accent-marine"
                      aria-label={t("select", { title: pick(locale, r.title, r.title_en) })}
                    />
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="text-sm font-medium text-marine">{pick(locale, r.title, r.title_en)}</p>
                      <p className="text-xs break-words text-ink-muted">
                        {[
                          r.matter?.display_number,
                          person(r.client),
                          r.due_date ? t("dueOn", { date: formatCalendarDate(r.due_date, locale) }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        shown === "fulfilled"
                          ? "completed"
                          : shown === "overdue"
                            ? "urgent"
                            : shown === "cancelled"
                              ? "pending"
                              : "active"
                      }
                      label={t(`status.${shown}`)}
                    />
                    <Link
                      href={`/admin/matters/${r.matter_id}?tab=documents`}
                      className="inline-flex min-h-6 items-center text-sm text-gold-ink hover:underline"
                    >
                      {t("openMatter")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </form>
        )}
      </SectionCard>
    </>
  );
}
