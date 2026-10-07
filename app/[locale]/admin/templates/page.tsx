import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createTypeAction } from "@/server/actions/templates";
import { requireStaff } from "@/server/auth/session";
import { listMatterTypes, pick, practiceGroups } from "@/server/services/matter-templates";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/** Modèles de dossiers (ADR 0019) : firm_admin seulement ; 404 sinon. */
export default async function TemplatesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/templates">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const [t, types] = await Promise.all([getTranslations("admin.templates"), listMatterTypes()]);
  const notice = sp.notice === "failed" || sp.notice === "invalid" ? sp.notice : undefined;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice message={notice ? t(`notices.${notice}`) : undefined} error />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {practiceGroups.map((g) => (
            <SectionCard key={g} title={t(`groups.${g}`)}>
              <ul className="divide-y divide-gray-100">
                {types
                  .filter((ty) => ty.practice_group === g)
                  .map((ty) => (
                    <li key={ty.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1 basis-48 text-sm font-medium text-marine">
                        {pick(locale, ty.name_fr, ty.name_en)}
                      </span>
                      {ty.is_active ? null : <StatusBadge tone="pending" label={t("inactive")} />}
                      <Button asChild variant="outline-gold" size="sm">
                        <Link
                          href={`/admin/templates/${ty.id}`}
                          aria-label={t("editLabel", { name: pick(locale, ty.name_fr, ty.name_en) })}
                        >
                          {t("edit")}
                        </Link>
                      </Button>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          ))}
        </div>
        <SectionCard title={t("newType")} className="lg:col-span-2">
          <form action={createTypeAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="space-y-1">
              <label htmlFor="type-group" className={labelClass}>
                {t("group")}
              </label>
              <select id="type-group" name="group" defaultValue="legal" className={`${fieldClass} h-11`}>
                {practiceGroups.map((g) => (
                  <option key={g} value={g}>
                    {t(`groups.${g}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="type-fr" className={labelClass}>
                {t("nameFr")}
              </label>
              <input id="type-fr" name="nameFr" required maxLength={200} className={`${fieldClass} h-11`} />
            </div>
            <div className="space-y-1">
              <label htmlFor="type-en" className={labelClass}>
                {t("nameEn")}
              </label>
              <input id="type-en" name="nameEn" required maxLength={200} className={`${fieldClass} h-11`} />
            </div>
            <Button type="submit" variant="primary" size="brand">
              {t("create")}
            </Button>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
