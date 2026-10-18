import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContractList } from "@/components/admin/contract-list";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/session";
import { contractFiltersSchema, contractStatuses, listContracts } from "@/server/services/contracts";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/** Contrats (ADR 0032, F1) : tous les contrats visibles (auteur, équipe du dossier, firm_admin). */
export default async function ContractsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/contracts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const filters = contractFiltersSchema.parse({
    status: sp.status || undefined,
    q: sp.q || undefined,
    mine: sp.mine || undefined,
  });
  const [t, rows] = await Promise.all([getTranslations("admin.contracts"), listContracts(filters)]);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/admin/contracts/new">{t("new")}</Link>
          </Button>
        }
      />
      <SectionCard className="mb-6">
        <form
          method="get"
          action={`/${locale}/admin/contracts`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="space-y-1">
            <label htmlFor="k-q" className={labelClass}>
              {t("filters.q")}
            </label>
            <input id="k-q" name="q" defaultValue={filters.q ?? ""} maxLength={100} className={fieldClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="k-status" className={labelClass}>
              {t("filters.status")}
            </label>
            <select id="k-status" name="status" defaultValue={filters.status} className={fieldClass}>
              <option value="active">{t("filters.active")}</option>
              <option value="all">{t("filters.all")}</option>
              {contractStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="inline-flex h-10 items-center gap-2 text-sm text-marine">
              <input
                type="checkbox"
                name="mine"
                value="1"
                defaultChecked={Boolean(filters.mine)}
                className="size-4 accent-gold"
              />
              {t("filters.mine")}
            </label>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="primary" size="sm">
              {t("filters.apply")}
            </Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard title={t("listTitle", { count: rows?.length ?? 0 })}>
        <ContractList rows={rows ?? []} locale={locale} />
      </SectionCard>
    </>
  );
}
