import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { TagChip } from "@/components/shared/tag-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { bulkCreateRequestsAction } from "@/server/actions/requests";
import { requireStaff } from "@/server/auth/session";
import { listPortfolio, listTags, matterFiltersSchema } from "@/server/services/matter-tags";
import { listMatterTypes, pick } from "@/server/services/matter-templates";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";

/**
 * Même demande de document envoyée à plusieurs dossiers (ADR 0022) : personnel.
 * 1) on filtre les dossiers (étiquette, type) ; 2) on coche ; 3) une demande par client ayant accès.
 */
export default async function BulkRequestPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/requests/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const filters = matterFiltersSchema.parse({
    tag: sp.tag || undefined,
    type: sp.type || undefined,
    status: "open",
  });
  const [t, portfolio, tags, types] = await Promise.all([
    getTranslations("admin.requests"),
    listPortfolio(filters),
    listTags(),
    listMatterTypes(),
  ]);
  const tagById = new Map(tags.map((tg) => [tg.id, tg]));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/requests"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("back")}
        </Link>
      </p>
      <PageHeader title={t("bulkCreate")} subtitle={t("bulkSubtitle")} />
      <Notice
        message={
          sp.notice === "invalid"
            ? t("notices.invalid")
            : sp.notice === "tooMany"
              ? t("notices.tooMany")
              : undefined
        }
        error
      />

      <SectionCard title={t("step1")} className="mb-6">
        <form method="get" action={`/${locale}/admin/requests/new`} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="b-tag" className={labelClass}>
              {t("filters.tag")}
            </label>
            <select id="b-tag" name="tag" defaultValue={filters.tag ?? ""} className={`${fieldClass} h-10`}>
              <option value="">{t("filters.all")}</option>
              {tags.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {pick(locale, tg.name_fr, tg.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="b-type" className={labelClass}>
              {t("filters.type")}
            </label>
            <select
              id="b-type"
              name="type"
              defaultValue={filters.type ?? ""}
              className={`${fieldClass} h-10`}
            >
              <option value="">{t("filters.all")}</option>
              {types.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {pick(locale, ty.name_fr, ty.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline-gold" size="sm" className="h-10">
              {t("filters.apply")}
            </Button>
          </div>
        </form>
      </SectionCard>

      <form action={bulkCreateRequestsAction} className="space-y-6">
        <input type="hidden" name="locale" value={locale} />
        <SectionCard title={t("step2", { count: portfolio.rows.length })}>
          {portfolio.rows.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noMatter")}</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("step2", { count: portfolio.rows.length })}</legend>
              {portfolio.rows.map((m) => (
                <label
                  key={m.id}
                  htmlFor={`b-m-${m.id}`}
                  className="flex min-h-9 flex-wrap items-center gap-2 text-sm"
                >
                  <input
                    id={`b-m-${m.id}`}
                    type="checkbox"
                    name="matterIds"
                    value={m.id}
                    defaultChecked
                    className="size-4 accent-marine"
                  />
                  <span className="font-medium text-marine">
                    {[m.display_number, m.title].filter(Boolean).join(" — ")}
                  </span>
                  {m.tagIds.map((id) => {
                    const tg = tagById.get(id);
                    return tg ? (
                      <TagChip key={id} label={pick(locale, tg.name_fr, tg.name_en)} color={tg.color} />
                    ) : null;
                  })}
                </label>
              ))}
            </fieldset>
          )}
        </SectionCard>
        <SectionCard title={t("step3")}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="b-title" className={labelClass}>
                {t("requestTitle")}
              </label>
              <input id="b-title" name="title" required maxLength={200} className={`${fieldClass} h-11`} />
            </div>
            <div className="space-y-1">
              <label htmlFor="b-description" className={labelClass}>
                {t("requestDescription")}
              </label>
              <textarea
                id="b-description"
                name="description"
                rows={2}
                maxLength={1000}
                className={`${fieldClass} py-2`}
              />
            </div>
            <div className="max-w-xs space-y-1">
              <label htmlFor="b-due" className={labelClass}>
                {t("requestDue")}
              </label>
              <input id="b-due" name="dueDate" type="date" className={`${fieldClass} h-11`} />
            </div>
            <InfoNote>{t("bulkHelp")}</InfoNote>
          </div>
        </SectionCard>
        <Button type="submit" variant="primary" size="brand" disabled={portfolio.rows.length === 0}>
          {t("bulkSubmit")}
        </Button>
      </form>
    </>
  );
}
