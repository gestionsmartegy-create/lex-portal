import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { openMatterAction } from "@/server/actions/open-matter";
import { requireStaff } from "@/server/auth/session";
import { getOpeningContext } from "@/server/services/matter-opening";
import { pick, practiceGroups } from "@/server/services/matter-templates";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
type Person = { first_name: string | null; last_name: string | null; email: string };
const personName = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

/**
 * Assistant d'ouverture d'un dossier (ADR 0020) : firm_admin seulement ; 404 sinon.
 * 1) dossier venu de Clio + type ; 2) tout le reste sur un seul écran, appliqué en une fois.
 */
export default async function OpenMatterPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const matterId = typeof sp.matterId === "string" ? sp.matterId : null;
  const typeId = typeof sp.typeId === "string" ? sp.typeId : null;
  const [t, ctx] = await Promise.all([getTranslations("admin.opening"), getOpeningContext(matterId, typeId)]);
  if (!ctx) return null;
  const notice = sp.notice === "invalid" || sp.notice === "failed" ? sp.notice : undefined;
  const ready = ctx.matter && ctx.template;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/matters"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("back")}
        </Link>
      </p>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice message={notice ? t(`notices.${notice}`) : undefined} error />

      <SectionCard title={t("step1")}>
        <form method="get" action={`/${locale}/admin/matters/new`} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="open-matter" className={labelClass}>
                {t("matter")}
              </label>
              <select
                id="open-matter"
                name="matterId"
                required
                defaultValue={ctx.matter?.id ?? ""}
                className={`${fieldClass} h-11`}
              >
                <option value="" disabled>
                  {t("chooseMatter")}
                </option>
                {ctx.matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {[m.display_number, m.title].filter(Boolean).join(" — ")}
                    {m.matter_type_id ? ` ${t("configured")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="open-type" className={labelClass}>
                {t("type")}
              </label>
              <select
                id="open-type"
                name="typeId"
                required
                defaultValue={ctx.template?.type.id ?? ""}
                className={`${fieldClass} h-11`}
              >
                <option value="" disabled>
                  {t("chooseType")}
                </option>
                {practiceGroups.map((g) => (
                  <optgroup key={g} label={t(`groups.${g}`)}>
                    {ctx.types
                      .filter((ty) => ty.practice_group === g)
                      .map((ty) => (
                        <option key={ty.id} value={ty.id}>
                          {pick(locale, ty.name_fr, ty.name_en)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <InfoNote>{t("clioFirst")}</InfoNote>
          <Button type="submit" variant="outline-gold" size="sm">
            {t("continue")}
          </Button>
        </form>
      </SectionCard>

      {ready ? (
        <form action={openMatterAction} className="mt-6 space-y-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="matterId" value={ctx.matter!.id} />
          <input type="hidden" name="typeId" value={ctx.template!.type.id} />

          <SectionCard title={t("step2")}>
            <label htmlFor="open-apply" className="flex min-h-10 items-center gap-2 text-sm text-marine">
              <input
                id="open-apply"
                type="checkbox"
                name="applySteps"
                defaultChecked
                className="size-4 accent-marine"
              />
              {t("applySteps", { count: ctx.template!.steps.length })}
            </label>
            <ol className="mt-2 list-decimal space-y-1 pl-8 text-sm text-ink-muted">
              {ctx.template!.steps.map((s) => (
                <li key={s.id}>{pick(locale, s.title_fr, s.title_en)}</li>
              ))}
            </ol>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("step3")}>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="open-responsible" className={labelClass}>
                    {t("responsible")}
                  </label>
                  <select
                    id="open-responsible"
                    name="responsibleId"
                    defaultValue=""
                    className={`${fieldClass} h-11`}
                  >
                    <option value="">{t("none")}</option>
                    {ctx.staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personName(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="open-office" className={labelClass}>
                    {t("office")}
                  </label>
                  <select
                    id="open-office"
                    name="officeId"
                    defaultValue="auto"
                    className={`${fieldClass} h-11`}
                  >
                    <option value="auto">{t("officeAuto")}</option>
                    {ctx.offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {pick(locale, o.name_fr, o.name_en)}
                      </option>
                    ))}
                    <option value="">{t("officeNone")}</option>
                  </select>
                </div>
                <fieldset className="space-y-2">
                  <legend className={labelClass}>{t("collaborators")}</legend>
                  {ctx.staff.map((p) => (
                    <label
                      key={p.id}
                      htmlFor={`open-collab-${p.id}`}
                      className="flex min-h-8 items-center gap-2 text-sm break-all text-marine"
                    >
                      <input
                        id={`open-collab-${p.id}`}
                        type="checkbox"
                        name="collaboratorIds"
                        value={p.id}
                        className="size-4 accent-marine"
                      />
                      {personName(p)} ({p.email})
                    </label>
                  ))}
                </fieldset>
              </div>
            </SectionCard>

            <SectionCard title={t("step4")}>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="open-client" className={labelClass}>
                    {t("client")}
                  </label>
                  <select id="open-client" name="clientId" defaultValue="" className={`${fieldClass} h-11`}>
                    <option value="">{t("noClient")}</option>
                    {ctx.clients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personName(p)} ({p.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-ink-muted">
                    {t("inviteHint")}{" "}
                    <Link href="/admin/invitations" className="text-gold-ink hover:underline">
                      {t("inviteLink")}
                    </Link>
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="open-level" className={labelClass}>
                    {t("accessLevel")}
                  </label>
                  <select
                    id="open-level"
                    name="accessLevel"
                    defaultValue="read_write"
                    className={`${fieldClass} h-11`}
                  >
                    <option value="read">{t("levelRead")}</option>
                    <option value="read_write">{t("levelWrite")}</option>
                  </select>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title={t("step5")}>
            <p className="mb-3 text-sm text-ink-muted">{t("documentsHelp")}</p>
            {ctx.template!.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noDocuments")}</p>
            ) : (
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">{t("step5")}</legend>
                {ctx.template!.documents.map((d) => (
                  <label
                    key={d.id}
                    htmlFor={`open-doc-${d.id}`}
                    className="flex min-h-8 items-center gap-2 text-sm text-marine"
                  >
                    <input
                      id={`open-doc-${d.id}`}
                      type="checkbox"
                      name="documentIds"
                      value={d.id}
                      className="size-4 accent-marine"
                    />
                    {pick(locale, d.title_fr, d.title_en)}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="mt-4 max-w-xs space-y-1">
              <label htmlFor="open-docs-due" className={labelClass}>
                {t("documentsDue")}
              </label>
              <input id="open-docs-due" name="documentsDue" type="date" className={`${fieldClass} h-11`} />
            </div>
          </SectionCard>

          <SectionCard title={t("step6")}>
            <p className="mb-3 text-sm text-ink-muted">{t("deliverablesHelp")}</p>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor={`open-del-${i}`} className={labelClass}>
                      {t("deliverable", { n: i + 1 })}
                    </label>
                    <input
                      id={`open-del-${i}`}
                      name="deliverableTitles"
                      maxLength={200}
                      className={`${fieldClass} h-11`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`open-del-due-${i}`} className={labelClass}>
                      {t("deliverableDue")}
                    </label>
                    <input
                      id={`open-del-due-${i}`}
                      name="deliverableDues"
                      type="date"
                      className={`${fieldClass} h-11`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <Button type="submit" variant="primary" size="brand">
            {t("submit")}
          </Button>
        </form>
      ) : null}
    </>
  );
}
