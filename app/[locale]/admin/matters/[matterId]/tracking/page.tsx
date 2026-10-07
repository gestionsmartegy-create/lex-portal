import { ArrowDown, ArrowUp, CheckCircle2, Circle } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import {
  addStepAction,
  addTeamMemberAction,
  deleteStepAction,
  moveStepAction,
  removeTeamMemberAction,
  toggleStepAction,
  updateStepAction,
} from "@/server/actions/tracking";
import { requireStaff } from "@/server/auth/session";
import { getMatterTracking } from "@/server/services/matter-tracking";

const NOTICES = [
  "added",
  "updated",
  "completed",
  "reopened",
  "moved",
  "deleted",
  "teamAdded",
  "teamRemoved",
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
  const { matter, steps, team, available, canManageTeam } = data;
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
                        <p className="font-medium text-marine">{s.title}</p>
                        {s.description ? <p className="text-sm text-ink-muted">{s.description}</p> : null}
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
                          aria-label={t("upLabel", { title: s.title })}
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
                          aria-label={t("downLabel", { title: s.title })}
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
                          aria-label={t("deleteLabel", { title: s.title })}
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
            <form action={addStepAction} className="space-y-4">
              {hidden}
              <div className="space-y-1">
                <label htmlFor="new-step-title" className={labelClass}>
                  {t("stepTitle")}
                </label>
                <input
                  id="new-step-title"
                  name="title"
                  required
                  maxLength={200}
                  className={`${fieldClass} h-11`}
                />
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
        </div>

        <SectionCard title={t("team")} className="lg:col-span-2">
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
    </>
  );
}
