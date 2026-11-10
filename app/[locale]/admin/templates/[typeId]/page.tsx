import { ArrowDown, ArrowUp } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  addItemAction,
  moveItemAction,
  removeItemAction,
  updateItemAction,
  updateTypeAction,
} from "@/server/actions/templates";
import { requireStaff } from "@/server/auth/session";
import {
  getMatterTypeTemplate,
  pick,
  practiceGroups,
  type TemplateField,
  type TemplateItemKind,
  type TemplateStep,
} from "@/server/services/matter-templates";

const NOTICES = ["created", "saved", "added", "removed", "moved", "failed", "invalid"] as const;
const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";

type Item = {
  id: string;
  fr: string;
  en: string;
  descFr?: string | null;
  descEn?: string | null;
  field?: TemplateField;
};
type T = Awaited<ReturnType<typeof getTranslations>>;

/** Champs d'un élément (étape, document ou champ), en français et en anglais. */
function ItemFields({
  kind,
  prefix,
  item,
  t,
}: {
  kind: TemplateItemKind;
  prefix: string;
  item?: Item;
  t: T;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${prefix}-fr`} className={labelClass}>
            {t("labelFr")}
          </label>
          <input
            id={`${prefix}-fr`}
            name="fr"
            required
            maxLength={kind === "fields" ? 120 : 200}
            defaultValue={item?.fr}
            className={`${fieldClass} h-10`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-en`} className={labelClass}>
            {t("labelEn")}
          </label>
          <input
            id={`${prefix}-en`}
            name="en"
            required
            maxLength={kind === "fields" ? 120 : 200}
            defaultValue={item?.en}
            className={`${fieldClass} h-10`}
          />
        </div>
      </div>
      {kind === "fields" ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor={`${prefix}-kind`} className={labelClass}>
              {t("fieldKind")}
            </label>
            <select
              id={`${prefix}-kind`}
              name="fieldKind"
              defaultValue={item?.field?.kind ?? "text"}
              className={`${fieldClass} h-10`}
            >
              {(["text", "date", "number"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </div>
          <label
            htmlFor={`${prefix}-visible`}
            className="flex min-h-10 items-center gap-2 text-sm text-marine"
          >
            <input
              id={`${prefix}-visible`}
              type="checkbox"
              name="visible"
              defaultChecked={item?.field?.visible_to_client ?? false}
              className="size-4 accent-marine"
            />
            {t("visibleToClient")}
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${prefix}-dfr`} className={labelClass}>
              {t("descFr")}
            </label>
            <textarea
              id={`${prefix}-dfr`}
              name="descFr"
              rows={2}
              maxLength={1000}
              defaultValue={item?.descFr ?? ""}
              className={`${fieldClass} py-2`}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${prefix}-den`} className={labelClass}>
              {t("descEn")}
            </label>
            <textarea
              id={`${prefix}-den`}
              name="descEn"
              rows={2}
              maxLength={1000}
              defaultValue={item?.descEn ?? ""}
              className={`${fieldClass} py-2`}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Modèle d'un type de dossier (ADR 0019) : firm_admin seulement ; 404 sinon. */
export default async function TemplatePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/templates/[typeId]">) {
  const { locale, typeId } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const data = await getMatterTypeTemplate(typeId);
  if (!data) notFound();
  const t = await getTranslations("admin.templates");
  const notice = NOTICES.find((n) => n === sp.notice);
  const { type } = data;
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="typeId" value={type.id} />
    </>
  );
  const asItems = (rows: TemplateStep[]): Item[] =>
    rows.map((r) => ({
      id: r.id,
      fr: r.title_fr,
      en: r.title_en,
      descFr: r.description_fr,
      descEn: r.description_en,
    }));
  const sections: { kind: TemplateItemKind; items: Item[] }[] = [
    { kind: "steps", items: asItems(data.steps) },
    { kind: "documents", items: asItems(data.documents) },
    {
      kind: "fields",
      items: data.fields.map((f) => ({ id: f.id, fr: f.label_fr, en: f.label_en, field: f })),
    },
  ];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/templates"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("back")}
        </Link>
      </p>
      <PageHeader title={pick(locale, type.name_fr, type.name_en)} subtitle={t("draftNote")} />
      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "invalid"}
      />

      <div className="space-y-6">
        <SectionCard title={t("typeSettings")}>
          <form action={updateTypeAction} className="space-y-4">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="type-group" className={labelClass}>
                  {t("group")}
                </label>
                <select
                  id="type-group"
                  name="group"
                  defaultValue={type.practice_group}
                  className={`${fieldClass} h-10`}
                >
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
                <input
                  id="type-fr"
                  name="nameFr"
                  required
                  maxLength={200}
                  defaultValue={type.name_fr}
                  className={`${fieldClass} h-10`}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="type-en" className={labelClass}>
                  {t("nameEn")}
                </label>
                <input
                  id="type-en"
                  name="nameEn"
                  required
                  maxLength={200}
                  defaultValue={type.name_en}
                  className={`${fieldClass} h-10`}
                />
              </div>
            </div>
            <label htmlFor="type-active" className="flex min-h-10 items-center gap-2 text-sm text-marine">
              <input
                id="type-active"
                type="checkbox"
                name="active"
                defaultChecked={type.is_active}
                className="size-4 accent-marine"
              />
              {t("active")}
            </label>
            <Button type="submit" variant="primary" size="sm">
              {t("save")}
            </Button>
          </form>
        </SectionCard>

        {sections.map(({ kind, items }) => (
          <SectionCard key={kind} title={t(`sections.${kind}`)}>
            <p className="mb-4 text-sm text-ink-muted">{t(`sectionsHelp.${kind}`)}</p>
            {items.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("empty")}</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {items.map((item, i) => (
                  <li key={item.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-sm font-medium text-marine">{item.fr}</p>
                        <p className="text-xs text-ink-muted">
                          {item.en}
                          {item.field
                            ? ` · ${t(`kinds.${item.field.kind}`)} · ${
                                item.field.visible_to_client ? t("visibleToClient") : t("internal")
                              }`
                            : ""}
                        </p>
                      </div>
                      {(["up", "down"] as const).map((dir) => (
                        <form key={dir} action={moveItemAction}>
                          {hidden}
                          <input type="hidden" name="kind" value={kind} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="direction" value={dir} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            disabled={dir === "up" ? i === 0 : i === items.length - 1}
                            aria-label={t(dir === "up" ? "upLabel" : "downLabel", { title: item.fr })}
                          >
                            {dir === "up" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                          </Button>
                        </form>
                      ))}
                      <form action={removeItemAction}>
                        {hidden}
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-9 text-destructive"
                          aria-label={t("removeLabel", { title: item.fr })}
                        >
                          {t("remove")}
                        </Button>
                      </form>
                    </div>
                    <details>
                      <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                        {t("edit")}
                      </summary>
                      <form action={updateItemAction} className="mt-3 space-y-3">
                        {hidden}
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <ItemFields kind={kind} prefix={`edit-${item.id}`} item={item} t={t} />
                        <Button type="submit" variant="outline-gold" size="sm">
                          {t("save")}
                        </Button>
                      </form>
                    </details>
                  </li>
                ))}
              </ol>
            )}
            <form action={addItemAction} className="mt-6 space-y-3 border-t border-gray-100 pt-6">
              {hidden}
              <input type="hidden" name="kind" value={kind} />
              <ItemFields kind={kind} prefix={`new-${kind}`} t={t} />
              <Button type="submit" variant="primary" size="sm">
                {t(`add.${kind}`)}
              </Button>
            </form>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
