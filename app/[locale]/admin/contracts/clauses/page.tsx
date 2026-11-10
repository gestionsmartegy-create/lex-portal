import { ScrollText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContractsTabs } from "@/components/admin/contracts-tabs";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { HelpTip } from "@/components/shared/help-tip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { saveClauseAction } from "@/server/actions/contract-library";
import { requireStaff } from "@/server/auth/session";
import { contractDomains, listClauses } from "@/server/services/contract-library";

const NOTICES = ["saved", "invalid", "failed"] as const;
const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const areaClass =
  "min-h-32 w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";

type Clause = Awaited<ReturnType<typeof listClauses>>[number];

/** Bibliothèque de clauses (ADR 0034, F5) : réservée au firm_admin ; chaque modification est versionnée. */
export default async function ClausesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/contracts/clauses">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const [t, tl, clauses] = await Promise.all([
    getTranslations("admin.contracts"),
    getTranslations("portal.profile.languages"),
    listClauses(),
  ]);
  const notice = NOTICES.find((n) => n === sp.notice);

  const form = (c: Clause | null) => {
    const k = c?.id ?? "new";
    return (
      <form action={saveClauseAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={c?.id ?? ""} />
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`cl-title-${k}`} className={labelClass}>
            {t("clauses.fields.title")}
          </label>
          <input
            id={`cl-title-${k}`}
            name="title"
            required
            maxLength={200}
            defaultValue={c?.title}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`cl-lang-${k}`} className={labelClass}>
            {t("clauses.fields.language")}
          </label>
          <select
            id={`cl-lang-${k}`}
            name="language"
            defaultValue={c?.language ?? (locale === "fr" ? "fr" : "en")}
            className={fieldClass}
          >
            <option value="fr">{tl("fr")}</option>
            <option value="en">{tl("en")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`cl-domain-${k}`} className={labelClass}>
            {t("editor.template.domain")}
          </label>
          <select
            id={`cl-domain-${k}`}
            name="domain"
            defaultValue={c?.domain ?? "other"}
            className={fieldClass}
          >
            {contractDomains.map((d) => (
              <option key={d} value={d}>
                {t(`editor.template.domains.${d}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`cl-body-${k}`} className={labelClass}>
            {t("clauses.fields.body")}
          </label>
          <textarea
            id={`cl-body-${k}`}
            name="body"
            required
            maxLength={20000}
            defaultValue={c?.body}
            className={areaClass}
          />
          <p className="text-xs text-ink-muted">{t("clauses.bodyHelp")}</p>
        </div>
        {c ? (
          <div className="space-y-1">
            <label htmlFor={`cl-active-${k}`} className={labelClass}>
              {t("clauses.fields.status")}
            </label>
            <select
              id={`cl-active-${k}`}
              name="isActive"
              defaultValue={String(c.is_active)}
              className={fieldClass}
            >
              <option value="true">{t("clauses.active")}</option>
              <option value="false">{t("clauses.inactive")}</option>
            </select>
          </div>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" variant={c ? "outline-marine" : "primary"} size="sm" className="h-10">
            {c ? t("clauses.save") : t("clauses.add")}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <>
      <PageHeader
        title={t("clauses.title")}
        subtitle={t("clauses.subtitle")}
        help={<HelpTip label={t("clauses.helpLabel")}>{t("clauses.help")}</HelpTip>}
      />
      <ContractsTabs active="clauses" isFirmAdmin />
      <Notice
        message={notice ? t(`clauses.notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "invalid"}
      />
      <SectionCard className="mb-6">
        <h2 className="mb-3 font-display text-base font-semibold text-marine">{t("clauses.new")}</h2>
        {form(null)}
      </SectionCard>
      <SectionCard>
        {clauses.length === 0 ? (
          <EmptyState icon={ScrollText} message={t("clauses.none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {clauses.map((c) => (
              <li key={c.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-semibold text-marine">{c.title}</span>
                    <span className="text-sm text-ink-muted">
                      {[
                        tl(c.language),
                        t(`editor.template.domains.${c.domain}`),
                        t("clauses.version", { version: c.version }),
                      ].join(" · ")}
                    </span>
                    <StatusBadge
                      tone={c.is_active ? "completed" : "pending"}
                      label={c.is_active ? t("clauses.active") : t("clauses.inactive")}
                    />
                  </summary>
                  <div className="mt-3">{form(c)}</div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
