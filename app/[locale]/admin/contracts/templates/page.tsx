import { LayoutTemplate } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContractsTabs } from "@/components/admin/contracts-tabs";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { HelpTip } from "@/components/shared/help-tip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { openTemplateDraftAction, updateTemplateAction } from "@/server/actions/contract-library";
import { requireStaff } from "@/server/auth/session";
import { contractDomains, listTemplates, signingModes } from "@/server/services/contract-library";

const NOTICES = ["saved", "published", "invalid", "failed"] as const;
const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/**
 * Modèles de contrats (ADR 0034, F4) : le personnel utilise les modèles publiés ; le firm_admin modifie un
 * modèle dans l'éditeur (brouillon), le publie en nouvelle version, le renomme ou l'archive.
 */
export default async function TemplatesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/contracts/templates">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const isAdmin = role === "firm_admin";
  const sp = await searchParams;
  const [t, tl, templates] = await Promise.all([
    getTranslations("admin.contracts"),
    getTranslations("portal.profile.languages"),
    listTemplates(),
  ]);
  const notice = NOTICES.find((n) => n === sp.notice);

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        subtitle={t("templates.subtitle")}
        help={<HelpTip label={t("templates.helpLabel")}>{t("templates.help")}</HelpTip>}
      />
      <ContractsTabs active="templates" isFirmAdmin={isAdmin} />
      <Notice
        message={notice ? t(`templates.notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "invalid"}
      />
      <SectionCard>
        {templates.length === 0 ? (
          <EmptyState icon={LayoutTemplate} message={t("templates.none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {templates.map((tpl) => (
              <li key={tpl.id} className="py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-semibold text-marine">{tpl.name}</p>
                    <p className="text-sm text-ink-muted">
                      {[
                        t(`editor.template.domains.${tpl.domain}`),
                        tl(tpl.language),
                        t("templates.version", { version: tpl.current_version }),
                        t(`editor.template.signingModes.${tpl.signing}`),
                        formatDate(tpl.updated_at, locale),
                      ].join(" · ")}
                    </p>
                    {tpl.description ? (
                      <p className="mt-1 text-sm text-ink-muted">{tpl.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {tpl.is_mock ? <DemoDataBadge /> : null}
                    <StatusBadge
                      tone={
                        tpl.status === "published" ? "completed" : tpl.needs_review ? "warning" : "pending"
                      }
                      label={
                        tpl.status === "draft" && tpl.needs_review
                          ? t("templates.status.review")
                          : t(`templates.status.${tpl.status}`)
                      }
                    />
                    {tpl.status === "published" ? (
                      <Button asChild variant="primary" size="sm">
                        <Link href={`/admin/contracts/new?template=${tpl.id}`}>{t("templates.use")}</Link>
                      </Button>
                    ) : null}
                    {isAdmin && tpl.status !== "archived" ? (
                      <form action={openTemplateDraftAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="templateId" value={tpl.id} />
                        <Button type="submit" variant="outline-marine" size="sm">
                          {tpl.status === "draft" ? t("templates.review") : t("templates.edit")}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {isAdmin && tpl.status !== "draft" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-gold-ink hover:underline">
                      {t("templates.settings")}
                    </summary>
                    <form
                      action={updateTemplateAction}
                      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={tpl.id} />
                      <div className="space-y-1 sm:col-span-2">
                        <label htmlFor={`tn-${tpl.id}`} className={labelClass}>
                          {t("editor.template.name")}
                        </label>
                        <input
                          id={`tn-${tpl.id}`}
                          name="name"
                          required
                          maxLength={200}
                          defaultValue={tpl.name}
                          className={fieldClass}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label htmlFor={`tdesc-${tpl.id}`} className={labelClass}>
                          {t("templates.description")}
                        </label>
                        <input
                          id={`tdesc-${tpl.id}`}
                          name="description"
                          maxLength={500}
                          defaultValue={tpl.description ?? ""}
                          className={fieldClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`td-${tpl.id}`} className={labelClass}>
                          {t("editor.template.domain")}
                        </label>
                        <select
                          id={`td-${tpl.id}`}
                          name="domain"
                          defaultValue={tpl.domain}
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
                        <label htmlFor={`ts-${tpl.id}`} className={labelClass}>
                          {t("editor.template.signing")}
                        </label>
                        <select
                          id={`ts-${tpl.id}`}
                          name="signing"
                          defaultValue={tpl.signing}
                          className={fieldClass}
                        >
                          {signingModes.map((m) => (
                            <option key={m} value={m}>
                              {t(`editor.template.signingModes.${m}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`tst-${tpl.id}`} className={labelClass}>
                          {t("templates.statusLabel")}
                        </label>
                        <select
                          id={`tst-${tpl.id}`}
                          name="status"
                          defaultValue={tpl.status}
                          className={fieldClass}
                        >
                          <option value="published">{t("templates.status.published")}</option>
                          <option value="archived">{t("templates.status.archived")}</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button type="submit" variant="outline-marine" size="sm" className="h-10">
                          {t("templates.saveSettings")}
                        </Button>
                      </div>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
