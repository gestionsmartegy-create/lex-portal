import { Receipt } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContractsTabs } from "@/components/admin/contracts-tabs";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { HelpTip } from "@/components/shared/help-tip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { saveServiceAction, saveTaxRateAction } from "@/server/actions/contract-library";
import { requireStaff } from "@/server/auth/session";
import { contractDomains, listServices, listTaxRates } from "@/server/services/contract-library";

const NOTICES = ["saved", "taxSaved", "invalid", "failed"] as const;
const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";

type Service = Awaited<ReturnType<typeof listServices>>[number];

/**
 * Catalogue des services et taux de taxes (ADR 0034, F6) : réservé au firm_admin. Les taux de départ sont
 * marqués « à vérifier » tant que le cabinet ne les a pas confirmés.
 */
export default async function ServicesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/contracts/services">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const [t, services, rates] = await Promise.all([
    getTranslations("admin.contracts"),
    listServices(),
    listTaxRates(),
  ]);
  const notice = NOTICES.find((n) => n === sp.notice);

  const serviceForm = (s: Service | null) => {
    const k = s?.id ?? "new";
    return (
      <form action={saveServiceAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={s?.id ?? ""} />
        <div className="space-y-1">
          <label htmlFor={`sv-fr-${k}`} className={labelClass}>
            {t("catalog.fields.nameFr")}
          </label>
          <input
            id={`sv-fr-${k}`}
            name="nameFr"
            required
            maxLength={200}
            defaultValue={s?.name_fr}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`sv-en-${k}`} className={labelClass}>
            {t("catalog.fields.nameEn")}
          </label>
          <input
            id={`sv-en-${k}`}
            name="nameEn"
            required
            maxLength={200}
            defaultValue={s?.name_en}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`sv-domain-${k}`} className={labelClass}>
            {t("editor.template.domain")}
          </label>
          <select
            id={`sv-domain-${k}`}
            name="domain"
            defaultValue={s?.domain ?? "other"}
            className={fieldClass}
          >
            {contractDomains.map((d) => (
              <option key={d} value={d}>
                {t(`editor.template.domains.${d}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`sv-pricing-${k}`} className={labelClass}>
            {t("catalog.fields.pricing")}
          </label>
          <select
            id={`sv-pricing-${k}`}
            name="pricing"
            defaultValue={s?.pricing ?? "flat"}
            className={fieldClass}
          >
            <option value="flat">{t("catalog.flat")}</option>
            <option value="hourly">{t("catalog.hourly")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`sv-amount-${k}`} className={labelClass}>
            {t("catalog.fields.amount")}
          </label>
          <input
            id={`sv-amount-${k}`}
            name="amount"
            required
            inputMode="decimal"
            pattern="\d{1,7}(\.\d{1,2})?"
            defaultValue={s?.amount}
            className={fieldClass}
          />
        </div>
        {s ? (
          <div className="space-y-1">
            <label htmlFor={`sv-active-${k}`} className={labelClass}>
              {t("clauses.fields.status")}
            </label>
            <select
              id={`sv-active-${k}`}
              name="isActive"
              defaultValue={String(s.is_active)}
              className={fieldClass}
            >
              <option value="true">{t("clauses.active")}</option>
              <option value="false">{t("clauses.inactive")}</option>
            </select>
          </div>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" variant={s ? "outline-marine" : "primary"} size="sm" className="h-10">
            {s ? t("catalog.save") : t("catalog.add")}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <>
      <PageHeader
        title={t("catalog.title")}
        subtitle={t("catalog.subtitle")}
        help={<HelpTip label={t("catalog.helpLabel")}>{t("catalog.help")}</HelpTip>}
      />
      <ContractsTabs active="services" isFirmAdmin />
      <Notice
        message={notice ? t(`catalog.notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "invalid"}
      />
      <SectionCard className="mb-6">
        <h2 className="mb-3 font-display text-base font-semibold text-marine">{t("catalog.new")}</h2>
        {serviceForm(null)}
      </SectionCard>
      <SectionCard className="mb-6">
        <h2 className="mb-3 font-display text-base font-semibold text-marine">{t("catalog.listTitle")}</h2>
        {services.length === 0 ? (
          <EmptyState icon={Receipt} message={t("catalog.none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {services.map((s) => (
              <li key={s.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-semibold text-marine">
                      {locale === "fr" ? s.name_fr : s.name_en}
                    </span>
                    <span className="text-sm text-ink-muted tabular-nums">
                      {formatMoney(s.amount, locale)}
                      {s.pricing === "hourly" ? ` ${t("services.perHour")}` : ""}
                    </span>
                    {s.is_mock ? <DemoDataBadge /> : null}
                    {s.is_active ? null : <StatusBadge tone="pending" label={t("clauses.inactive")} />}
                  </summary>
                  <div className="mt-3">{serviceForm(s)}</div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard>
        <h2 className="mb-1 font-display text-base font-semibold text-marine">{t("catalog.taxTitle")}</h2>
        <p className="mb-3 text-sm text-ink-muted">{t("catalog.taxHelp")}</p>
        <ul className="divide-y divide-gray-100">
          {rates.map((r) => (
            <li key={r.id} className="py-3">
              <form action={saveTaxRateAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="province" value={r.province} />
                <input type="hidden" name="taxCode" value={r.tax_code} />
                <div className="min-w-40 flex-1">
                  <p className="font-semibold text-marine">
                    {t(`provinces.${r.province}`)} · {t(`services.tax.${r.tax_code}`)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {r.effective_to
                      ? t("catalog.period", {
                          from: formatDate(r.effective_from, locale),
                          to: formatDate(r.effective_to, locale),
                        })
                      : t("catalog.since", { from: formatDate(r.effective_from, locale) })}
                  </p>
                </div>
                <div className="w-28 space-y-1">
                  <label htmlFor={`tx-rate-${r.id}`} className={labelClass}>
                    {t("catalog.fields.rate")}
                  </label>
                  <input
                    id={`tx-rate-${r.id}`}
                    name="rate"
                    required
                    inputMode="decimal"
                    pattern="\d{1,2}(\.\d{1,3})?"
                    defaultValue={r.rate.replace(/\.?0+$/, "")}
                    className={fieldClass}
                  />
                </div>
                <div className="w-40 space-y-1">
                  <label htmlFor={`tx-from-${r.id}`} className={labelClass}>
                    {t("catalog.fields.effectiveFrom")}
                  </label>
                  <input
                    id={`tx-from-${r.id}`}
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={r.effective_from}
                    className={fieldClass}
                  />
                </div>
                <label className="flex h-10 items-center gap-2 text-sm text-marine">
                  <input
                    type="checkbox"
                    name="verified"
                    value="true"
                    defaultChecked={!r.needs_verification}
                    className="size-4 accent-marine"
                  />
                  {t("catalog.verified")}
                </label>
                {r.needs_verification ? <StatusBadge tone="warning" label={t("catalog.toVerify")} /> : null}
                <Button type="submit" variant="outline-marine" size="sm" className="h-10">
                  {t("catalog.saveRate")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
