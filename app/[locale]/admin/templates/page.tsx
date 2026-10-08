import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { TagChip } from "@/components/shared/tag-chip";
import { createTagAction, createTypeAction, updateTagAction } from "@/server/actions/templates";
import { requireStaff } from "@/server/auth/session";
import { listMatterTypes, pick, practiceGroups } from "@/server/services/matter-templates";
import { listTags, tagColors } from "@/server/services/matter-tags";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

type TagValues = {
  name_fr: string;
  name_en: string;
  color: (typeof tagColors)[number];
  visible_to_client: boolean;
};

/** Champs d'une étiquette : noms, couleur, visibilité par le client. */
function TagFields({
  t,
  prefix,
  values,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  prefix: string;
  values?: TagValues;
}) {
  return (
    <>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-fr`} className={labelClass}>
          {t("nameFr")}
        </label>
        <input
          id={`${prefix}-fr`}
          name="nameFr"
          required
          maxLength={60}
          defaultValue={values?.name_fr}
          className={`${fieldClass} h-10`}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-en`} className={labelClass}>
          {t("nameEn")}
        </label>
        <input
          id={`${prefix}-en`}
          name="nameEn"
          required
          maxLength={60}
          defaultValue={values?.name_en}
          className={`${fieldClass} h-10`}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-color`} className={labelClass}>
          {t("tags.color")}
        </label>
        <select
          id={`${prefix}-color`}
          name="color"
          defaultValue={values?.color ?? "gold"}
          className={`${fieldClass} h-10`}
        >
          {tagColors.map((c) => (
            <option key={c} value={c}>
              {t(`tags.colors.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <label htmlFor={`${prefix}-visible`} className="flex min-h-10 items-center gap-2 text-sm text-marine">
        <input
          id={`${prefix}-visible`}
          type="checkbox"
          name="visible"
          defaultChecked={values?.visible_to_client ?? false}
          className="size-4 accent-marine"
        />
        {t("tags.visible")}
      </label>
    </>
  );
}

/** Modèles de dossiers (ADR 0019) : firm_admin seulement ; 404 sinon. */
export default async function TemplatesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/templates">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const [t, types, tags] = await Promise.all([
    getTranslations("admin.templates"),
    listMatterTypes(),
    listTags(),
  ]);
  const notice =
    sp.notice === "failed" || sp.notice === "invalid" || sp.notice === "tagSaved" ? sp.notice : undefined;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice message={notice ? t(`notices.${notice}`) : undefined} error={notice !== "tagSaved"} />

      <SectionCard title={t("tags.title")} className="mb-6">
        <p className="mb-4 text-sm text-ink-muted">{t("tags.help")}</p>
        <ul className="divide-y divide-gray-100">
          {tags.map((tg) => (
            <li key={tg.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <TagChip label={pick(locale, tg.name_fr, tg.name_en)} color={tg.color} />
                  <span className="text-xs text-ink-muted">
                    {[
                      tg.visible_to_client ? t("tags.visible") : t("tags.internal"),
                      tg.is_active ? null : t("inactive"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-sm text-gold-ink">{t("edit")}</span>
                </summary>
                <form action={updateTagAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="tagId" value={tg.id} />
                  <TagFields t={t} prefix={`tag-${tg.id}`} values={tg} />
                  <label
                    htmlFor={`tag-${tg.id}-active`}
                    className="flex min-h-10 items-center gap-2 text-sm text-marine"
                  >
                    <input
                      id={`tag-${tg.id}-active`}
                      type="checkbox"
                      name="active"
                      defaultChecked={tg.is_active}
                      className="size-4 accent-marine"
                    />
                    {t("tags.active")}
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" variant="outline-gold" size="sm">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <form
          action={createTagAction}
          className="mt-6 grid gap-3 border-t border-gray-100 pt-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="locale" value={locale} />
          <TagFields t={t} prefix="tag-new" />
          <div className="flex items-end">
            <Button type="submit" variant="primary" size="sm">
              {t("tags.create")}
            </Button>
          </div>
        </form>
      </SectionCard>
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
