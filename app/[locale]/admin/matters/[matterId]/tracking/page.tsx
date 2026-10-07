import { ArrowDown, ArrowUp, CheckCircle2, Circle } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  addStepFromListAction,
  addTeamMemberAction,
  applyTemplateAction,
  createRequestAction,
  requestStatusAction,
  saveFieldsAction,
  setMatterTypeAction,
  deleteStepAction,
  moveStepAction,
  removeTeamMemberAction,
  toggleStepAction,
  updateStepAction,
} from "@/server/actions/tracking";
import { requireStaff } from "@/server/auth/session";
import { getMatterTracking } from "@/server/services/matter-tracking";
import { pick, practiceGroups } from "@/server/services/matter-templates";

const NOTICES = [
  "added",
  "updated",
  "completed",
  "reopened",
  "moved",
  "deleted",
  "teamAdded",
  "teamRemoved",
  "typeSet",
  "templateApplied",
  "templateEmpty",
  "fieldsSaved",
  "requestCreated",
  "requestUpdated",
  "duplicate",
  "invalid",
  "failed",
] as const;
const ROLES = ["responsible", "originating", "collaborator", "assistant"] as const;

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

type Person = { first_name: string | null; last_name: string | null; email: string } | null;
const personName = (p: Person) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : "—";

/** Suivi du dossier (ADR 0018) : équipe du dossier ou firm_admin ; même 404 sinon. */
export default async function MatterTrackingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters/[matterId]/tracking">) {
  const { locale, matterId } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const data = await getMatterTracking(matterId);
  if (!data) notFound();
  const t = await getTranslations("admin.tracking");
  const { matter, steps, team, available, canManageTeam, types, template, fieldValues, requests, clients } =
    data;
  const today = new Date().toISOString().slice(0, 10);
  const notice = NOTICES.find((n) => n === sp.notice);
  const hidden = (
    <>
      <input type="hidden" name="matterId" value={matter.id} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );

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
      <PageHeader
        title={matter.title}
        subtitle={[matter.display_number, matter.practice_area].filter(Boolean).join(" · ")}
        actions={
          <>
            <MatterStatusBadge status={matter.status} />
            {matter.is_mock ? <DemoDataBadge /> : null}
          </>
        }
      />
      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "duplicate" || notice === "invalid"}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <SectionCard title={t("steps")}>
            {matter.progress_percent !== null ? (
              <div className="mb-4">
                <ProgressBar value={matter.progress_percent} label={t("progress")} />
              </div>
            ) : null}
            {steps.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noSteps")}</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {steps.map((s, i) => (
                  <li key={s.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-start gap-3">
                      {s.is_completed ? (
                        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-gold-ink" />
                      ) : (
                        <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-marine">{pick(locale, s.title, s.title_en)}</p>
                        {pick(locale, s.description ?? "", s.title_en ? s.description_en : null) ? (
                          <p className="text-sm text-ink-muted">
                            {pick(locale, s.description ?? "", s.title_en ? s.description_en : null)}
                          </p>
                        ) : null}
                        {s.is_completed && s.completed_at ? (
                          <p className="text-xs text-ink-muted">
                            {t("completedOn", { date: formatDate(s.completed_at, locale) })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-8">
                      <form action={toggleStepAction}>
                        {hidden}
                        <input type="hidden" name="stepId" value={s.id} />
                        <input type="hidden" name="completed" value={s.is_completed ? "false" : "true"} />
                        <Button type="submit" variant={s.is_completed ? "outline-gold" : "primary"} size="sm">
                          {s.is_completed ? t("reopen") : t("markDone")}
                        </Button>
                      </form>
                      <form action={moveStepAction}>
                        {hidden}
                        <input type="hidden" name="stepId" value={s.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          disabled={i === 0}
                          aria-label={t("upLabel", { title: pick(locale, s.title, s.title_en) })}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                      </form>
                      <form action={moveStepAction}>
                        {hidden}
                        <input type="hidden" name="stepId" value={s.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          disabled={i === steps.length - 1}
                          aria-label={t("downLabel", { title: pick(locale, s.title, s.title_en) })}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                      </form>
                      <form action={deleteStepAction}>
                        {hidden}
                        <input type="hidden" name="stepId" value={s.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-9 text-destructive"
                          aria-label={t("deleteLabel", { title: pick(locale, s.title, s.title_en) })}
                        >
                          {t("delete")}
                        </Button>
                      </form>
                    </div>
                    <details className="pl-8">
                      <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                        {t("edit")}
                      </summary>
                      <form action={updateStepAction} className="mt-3 space-y-3">
                        {hidden}
                        <input type="hidden" name="stepId" value={s.id} />
                        <div className="space-y-1">
                          <label htmlFor={`title-${s.id}`} className={labelClass}>
                            {t("stepTitle")}
                          </label>
                          <input
                            id={`title-${s.id}`}
                            name="title"
                            required
                            maxLength={200}
                            defaultValue={s.title}
                            className={`${fieldClass} h-10`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor={`description-${s.id}`} className={labelClass}>
                            {t("stepDescription")}
                          </label>
                          <textarea
                            id={`description-${s.id}`}
                            name="description"
                            rows={2}
                            maxLength={1000}
                            defaultValue={s.description ?? ""}
                            className={`${fieldClass} py-2`}
                          />
                        </div>
                        <Button type="submit" variant="outline-gold" size="sm">
                          {t("save")}
                        </Button>
                      </form>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title={t("addStep")}>
            <form action={addStepFromListAction} className="space-y-4">
              {hidden}
              {template && template.steps.length > 0 ? (
                <div className="space-y-1">
                  <label htmlFor="new-step-template" className={labelClass}>
                    {t("templateStep")}
                  </label>
                  <select
                    id="new-step-template"
                    name="templateStepId"
                    defaultValue=""
                    className={`${fieldClass} h-11`}
                  >
                    <option value="">{t("customStep")}</option>
                    {template.steps.map((ts) => (
                      <option key={ts.id} value={ts.id}>
                        {pick(locale, ts.title_fr, ts.title_en)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-1">
                <label htmlFor="new-step-title" className={labelClass}>
                  {template && template.steps.length > 0 ? t("customStepTitle") : t("stepTitle")}
                </label>
                <input id="new-step-title" name="title" maxLength={200} className={`${fieldClass} h-11`} />
              </div>
              <div className="space-y-1">
                <label htmlFor="new-step-description" className={labelClass}>
                  {t("stepDescription")}
                </label>
                <textarea
                  id="new-step-description"
                  name="description"
                  rows={2}
                  maxLength={1000}
                  className={`${fieldClass} py-2`}
                />
              </div>
              <Button type="submit" variant="primary" size="brand">
                {t("addSubmit")}
              </Button>
            </form>
          </SectionCard>

          <SectionCard title={t("requests")}>
            <p className="mb-4 text-sm text-ink-muted">{t("requestsHelp")}</p>
            {requests.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noRequests")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {requests.map((r) => {
                  const overdue = r.status === "pending" && r.due_date !== null && r.due_date < today;
                  const shown = overdue ? "overdue" : r.status;
                  return (
                    <li key={r.id} className="space-y-2 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-marine">{pick(locale, r.title, r.title_en)}</p>
                          {pick(locale, r.description ?? "", r.title_en ? r.description_en : null) ? (
                            <p className="text-sm text-ink-muted">
                              {pick(locale, r.description ?? "", r.title_en ? r.description_en : null)}
                            </p>
                          ) : null}
                          <p className="text-xs break-all text-ink-muted">
                            {[
                              personName(r.person),
                              r.due_date
                                ? t("dueOn", { date: formatCalendarDate(r.due_date, locale) })
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <StatusBadge
                          tone={
                            shown === "fulfilled"
                              ? "completed"
                              : shown === "overdue"
                                ? "urgent"
                                : shown === "cancelled"
                                  ? "pending"
                                  : "active"
                          }
                          label={t(`requestStatus.${shown}`)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(r.status === "pending"
                          ? (["fulfilled", "cancelled"] as const)
                          : (["pending"] as const)
                        ).map((next) => (
                          <form key={next} action={requestStatusAction}>
                            {hidden}
                            <input type="hidden" name="requestId" value={r.id} />
                            <input type="hidden" name="status" value={next} />
                            <Button
                              type="submit"
                              variant={next === "fulfilled" ? "primary" : "outline-gold"}
                              size="sm"
                              aria-label={t(`requestAction.${next}Label`, {
                                title: pick(locale, r.title, r.title_en),
                              })}
                            >
                              {t(`requestAction.${next}`)}
                            </Button>
                          </form>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {clients.length === 0 ? (
              <p className="mt-4 text-xs text-ink-muted">{t("noClientForRequest")}</p>
            ) : (
              <form action={createRequestAction} className="mt-6 space-y-4 border-t border-gray-100 pt-6">
                {hidden}
                <div className="space-y-1">
                  <label htmlFor="request-client" className={labelClass}>
                    {t("requestClient")}
                  </label>
                  <select id="request-client" name="clientId" required className={`${fieldClass} h-11`}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {personName(c.person)}
                      </option>
                    ))}
                  </select>
                </div>
                {template && template.documents.length > 0 ? (
                  <div className="space-y-1">
                    <label htmlFor="request-template" className={labelClass}>
                      {t("templateDocument")}
                    </label>
                    <select
                      id="request-template"
                      name="templateDocumentId"
                      defaultValue=""
                      className={`${fieldClass} h-11`}
                    >
                      <option value="">{t("customDocument")}</option>
                      {template.documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {pick(locale, d.title_fr, d.title_en)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <label htmlFor="request-title" className={labelClass}>
                    {template && template.documents.length > 0 ? t("customDocumentTitle") : t("requestTitle")}
                  </label>
                  <input id="request-title" name="title" maxLength={200} className={`${fieldClass} h-11`} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="request-description" className={labelClass}>
                    {t("requestDescription")}
                  </label>
                  <textarea
                    id="request-description"
                    name="description"
                    rows={2}
                    maxLength={1000}
                    className={`${fieldClass} py-2`}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="request-due" className={labelClass}>
                    {t("requestDue")}
                  </label>
                  <input id="request-due" name="dueDate" type="date" className={`${fieldClass} h-11`} />
                </div>
                <Button type="submit" variant="primary" size="brand">
                  {t("requestSubmit")}
                </Button>
              </form>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <SectionCard title={t("matterType")}>
            <form action={setMatterTypeAction} className="space-y-3">
              {hidden}
              <label htmlFor="matter-type" className={labelClass}>
                {t("matterType")}
              </label>
              <select
                id="matter-type"
                name="typeId"
                defaultValue={matter.matter_type_id ?? ""}
                className={`${fieldClass} h-11`}
              >
                <option value="">{t("noType")}</option>
                {practiceGroups.map((g) => (
                  <optgroup key={g} label={t(`groups.${g}`)}>
                    {types
                      .filter((ty) => ty.practice_group === g)
                      .map((ty) => (
                        <option key={ty.id} value={ty.id}>
                          {pick(locale, ty.name_fr, ty.name_en)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <Button type="submit" variant="outline-gold" size="sm">
                {t("saveType")}
              </Button>
            </form>
            {template && template.steps.length > 0 ? (
              <form action={applyTemplateAction} className="mt-4 border-t border-gray-100 pt-4">
                {hidden}
                <p className="mb-3 text-sm text-ink-muted">
                  {t("applyHelp", { count: template.steps.length })}
                </p>
                <Button type="submit" variant="primary" size="sm">
                  {t("applyTemplate")}
                </Button>
              </form>
            ) : null}
          </SectionCard>

          {template && template.fields.length > 0 ? (
            <SectionCard title={t("fields")}>
              <form action={saveFieldsAction} className="space-y-4">
                {hidden}
                {template.fields.map((f) => (
                  <div key={f.id} className="space-y-1">
                    <label htmlFor={`field-${f.id}`} className={labelClass}>
                      {pick(locale, f.label_fr, f.label_en)}
                    </label>
                    <input
                      id={`field-${f.id}`}
                      name={`field:${f.id}`}
                      type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
                      maxLength={500}
                      defaultValue={fieldValues[f.id] ?? ""}
                      aria-describedby={`field-${f.id}-help`}
                      className={`${fieldClass} h-11`}
                    />
                    <p id={`field-${f.id}-help`} className="text-xs text-ink-muted">
                      {f.visible_to_client ? t("fieldVisible") : t("fieldInternal")}
                    </p>
                  </div>
                ))}
                <Button type="submit" variant="primary" size="sm">
                  {t("saveFields")}
                </Button>
              </form>
            </SectionCard>
          ) : null}

          <SectionCard title={t("team")}>
            <p className="mb-4 text-sm text-ink-muted">{t("teamHelp")}</p>
            {team.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noTeam")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {team.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-all text-marine">{personName(m.person)}</p>
                      <p className="text-xs text-ink-muted">{t(`roles.${m.role}`)}</p>
                    </div>
                    {canManageTeam ? (
                      <form action={removeTeamMemberAction}>
                        {hidden}
                        <input type="hidden" name="userId" value={m.user_id} />
                        <Button
                          type="submit"
                          variant="outline-gold"
                          size="sm"
                          aria-label={t("removeLabel", { name: personName(m.person) })}
                        >
                          {t("remove")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManageTeam ? (
              available.length > 0 ? (
                <form action={addTeamMemberAction} className="mt-6 space-y-4 border-t border-gray-100 pt-6">
                  {hidden}
                  <div className="space-y-1">
                    <label htmlFor="team-member" className={labelClass}>
                      {t("member")}
                    </label>
                    <select
                      id="team-member"
                      name="userId"
                      required
                      defaultValue=""
                      className={`${fieldClass} h-11`}
                    >
                      <option value="" disabled>
                        {t("chooseMember")}
                      </option>
                      {available.map((p) => (
                        <option key={p.id} value={p.id}>
                          {personName(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="team-role" className={labelClass}>
                      {t("role")}
                    </label>
                    <select
                      id="team-role"
                      name="role"
                      defaultValue="collaborator"
                      className={`${fieldClass} h-11`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="primary" size="brand">
                    {t("addMember")}
                  </Button>
                </form>
              ) : null
            ) : (
              <p className="mt-4 text-xs text-ink-muted">{t("teamReadOnly")}</p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
