import { AlertTriangle, BarChart3 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, InfoNote, PageHeader, SectionCard, StatCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/session";
import { listMatterTypes, pick } from "@/server/services/matter-templates";
import { listCourts, listOffices } from "@/server/services/offices";
import { getWorkload, workloadFiltersSchema, type CountRow } from "@/server/services/workload";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const th = "px-3 py-2 text-left text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const td = "px-3 py-2 text-sm text-marine";

/** Barre proportionnelle (décorative) ; la valeur reste lisible en chiffres à côté. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <span aria-hidden className="hidden h-2 w-24 rounded-full bg-gray-100 sm:block">
      <span className="block h-2 rounded-full bg-gold" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * Charge de travail (ADR 0029, lot 6) : firm_admin. Par avocat, bureau, tribunal et domaine, sur
 * 30 ou 90 jours. Compteurs seulement (aucun contenu de dossier).
 */
export default async function WorkloadPage({ params, searchParams }: PageProps<"/[locale]/admin/workload">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const filters = workloadFiltersSchema.parse({ days: sp.days || undefined, office: sp.office || undefined });
  const [t, data, offices, courts, types] = await Promise.all([
    getTranslations("admin.workload"),
    getWorkload(filters),
    listOffices(),
    listCourts(),
    listMatterTypes(),
  ]);
  if (!data) return null;
  const officeName = (id: string | null) => {
    const o = offices.find((x) => x.id === id);
    return o ? pick(locale, o.name_fr, o.name_en) : t("noOffice");
  };
  const courtName = (id: string | null) => {
    const c = courts.find((x) => x.id === id);
    return c ? pick(locale, c.name_fr, c.name_en) : t("noCourt");
  };
  const typeName = (id: string | null) => {
    const ty = types.find((x) => x.id === id);
    return ty ? pick(locale, ty.name_fr, ty.name_en) : t("noType");
  };
  const maxCourt = Math.max(1, ...data.lawyers.map((l) => l.courtDates));
  const maxMatters = Math.max(1, ...data.lawyers.map((l) => l.openMatters));

  const countTable = (
    rows: CountRow[],
    label: string,
    name: (id: string | null) => string,
    region: string,
    withCourts = false,
  ) =>
    rows.length === 0 ? (
      <p className="text-sm text-ink-muted">{t("none")}</p>
    ) : (
      <div className="overflow-x-auto" role="region" aria-label={region} tabIndex={0}>
        <table className="w-full">
          <thead className="border-b border-gray-200">
            <tr>
              <th scope="col" className={th}>
                {label}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {withCourts ? t("cols.openMatters") : t("cols.count")}
              </th>
              {withCourts ? (
                <th scope="col" className={`${th} text-right`}>
                  {t("cols.courtDates")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id ?? "none"}>
                <th scope="row" className={`${td} text-left font-medium`}>
                  {name(r.id)}
                </th>
                <td className={`${td} text-right tabular-nums`}>{r.count}</td>
                {withCourts ? <td className={`${td} text-right tabular-nums`}>{r.courtDates ?? 0}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle", { days: filters.days })} />

      <SectionCard className="mb-6">
        <form method="get" action={`/${locale}/admin/workload`} className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1 sm:w-48">
            <label htmlFor="w-days" className={labelClass}>
              {t("filters.period")}
            </label>
            <select id="w-days" name="days" defaultValue={filters.days} className={fieldClass}>
              <option value="30">{t("filters.days", { days: 30 })}</option>
              <option value="90">{t("filters.days", { days: 90 })}</option>
            </select>
          </div>
          <div className="w-full space-y-1 sm:w-64">
            <label htmlFor="w-office" className={labelClass}>
              {t("filters.office")}
            </label>
            <select id="w-office" name="office" defaultValue={filters.office ?? ""} className={fieldClass}>
              <option value="">{t("filters.allOffices")}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {pick(locale, o.name_fr, o.name_en)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" size="sm" className="h-10">
            {t("filters.apply")}
          </Button>
        </form>
      </SectionCard>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("totals.matters")}
          value={String(data.totals.matters)}
          icon={BarChart3}
          tone="marine"
          href={`/admin/matters${filters.office ? `?office=${filters.office}` : ""}`}
        />
        <StatCard
          label={t("totals.courtDates", { days: filters.days })}
          value={String(data.totals.courtDates)}
          icon={BarChart3}
          tone="gold"
          href={`/admin/court-calendar${filters.office ? `?office=${filters.office}` : ""}`}
        />
        <StatCard
          label={t("totals.conflicts")}
          value={String(data.totals.conflicts)}
          icon={AlertTriangle}
          tone="red"
          href={`/admin/court-calendar${filters.office ? `?office=${filters.office}` : ""}`}
        />
      </div>
      {data.truncated ? (
        <div className="mb-6">
          <InfoNote>{t("truncated")}</InfoNote>
        </div>
      ) : null}

      <SectionCard title={t("lawyers")} className="mb-6">
        {data.lawyers.length === 0 ? (
          <EmptyState icon={BarChart3} message={t("none")} />
        ) : (
          <div className="overflow-x-auto" role="region" aria-label={t("lawyers")} tabIndex={0}>
            <table className="w-full sm:min-w-[40rem]">
              <thead className="border-b border-gray-200">
                <tr>
                  <th scope="col" className={th}>
                    {t("cols.lawyer")}
                  </th>
                  <th scope="col" className={th}>
                    {t("cols.office")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("cols.openMatters")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("cols.responsible")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("cols.courtDates")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("cols.conflicts")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("cols.deliverables")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.lawyers.map((l) => (
                  <tr key={l.id}>
                    <th scope="row" className={`${td} text-left font-medium`}>
                      <Link
                        href={`/admin/court-calendar?lawyer=${l.id}${filters.office ? `&office=${filters.office}` : ""}`}
                        className="hover:underline"
                        aria-label={t("openCalendar", { name: l.name })}
                      >
                        {l.name}
                      </Link>
                    </th>
                    <td className={`${td} text-ink-muted`}>
                      {l.primaryOfficeId ? officeName(l.primaryOfficeId) : "—"}
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center justify-end gap-2 tabular-nums">
                        <Bar value={l.openMatters} max={maxMatters} />
                        {l.openMatters}
                      </span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{l.responsibleMatters}</td>
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center justify-end gap-2 tabular-nums">
                        <Bar value={l.courtDates} max={maxCourt} />
                        {l.courtDates}
                      </span>
                    </td>
                    <td
                      className={`${td} text-right tabular-nums ${l.conflicts ? "font-semibold text-destructive" : ""}`}
                    >
                      {l.conflicts}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{l.deliverables}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title={t("offices")}>
          {countTable(data.offices, t("cols.office"), officeName, t("offices"), true)}
        </SectionCard>
        <SectionCard title={t("courts")}>
          {countTable(data.byCourt, t("cols.court"), courtName, t("courts"))}
        </SectionCard>
        <SectionCard title={t("types")}>
          {countTable(data.byType, t("cols.type"), typeName, t("types"))}
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-ink-muted">{t("help")}</p>
    </>
  );
}
