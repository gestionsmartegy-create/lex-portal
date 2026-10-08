import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileQuestion,
  MessageSquare,
  Wallet,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GrantAccessForm } from "@/components/admin/grant-access-form";
import { Notice } from "@/components/admin/notice";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { TabLinks } from "@/components/portal/tab-links";
import type { LucideIcon } from "lucide-react";
import { PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { TagChip } from "@/components/shared/tag-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { grantMatterAccessAction, revokeMatterAccessAction } from "@/server/actions/admin";
import {
  addDeliverableAction,
  addStepFromListAction,
  addTeamMemberAction,
  applyTemplateAction,
  createRequestAction,
  deleteStepAction,
  deliverableStatusAction,
  linkRequestDocumentAction,
  moveStepAction,
  removeDeliverableAction,
  removeTeamMemberAction,
  requestStatusAction,
  saveFieldsAction,
  setMatterTagsAction,
  setMatterTypeAction,
  toggleStepAction,
  updateStepAction,
} from "@/server/actions/tracking";
import { requireStaff } from "@/server/auth/session";
import { pick, practiceGroups } from "@/server/services/matter-templates";
import { deliverableStatuses, getMatterWorkspace } from "@/server/services/matter-workspace";
import { getMatterTagIds, listTags } from "@/server/services/matter-tags";

const TABS = ["overview", "steps", "documents", "team", "details"] as const;
type Tab = (typeof TABS)[number];
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
  "deliverableAdded",
  "deliverableUpdated",
  "deliverableRemoved",
  "documentLinked",
  "tagsSaved",
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

/** Indicateur du tableau de bord : valeur, libellé, précision facultative (ex. « 2 en retard »). */
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  alert = false,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[4px] bg-gold/15 text-gold-ink">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-2xl leading-none font-bold text-marine tabular-nums">
          {value}
        </span>
        <span className="mt-1 block text-xs text-ink-muted">{label}</span>
        {hint ? (
          <span
            className={`mt-0.5 block text-xs ${alert ? "font-semibold text-destructive" : "text-ink-muted"}`}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </>
  );
  const className = "flex items-center gap-4 rounded-[4px] border border-gray-100 bg-white p-5";
  return href ? (
    <Link
      href={href}
      className={`${className} transition-shadow duration-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Espace « Dossier » unifié (ADR 0020) : tableau de bord, étapes et livrables, documents,
 * équipe et accès, informations. Équipe du dossier ou firm_admin ; même 404 sinon.
 * La gestion des accès clients reste réservée au firm_admin (affichée pour lui seul).
 */
export default async function MatterWorkspacePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters/[matterId]">) {
  const { locale, matterId } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const sp = await searchParams;
  const data = await getMatterWorkspace(matterId);
  if (!data) notFound();
  const [t, tm, tw, allTags, tagIds] = await Promise.all([
    getTranslations("admin.tracking"),
    getTranslations("admin.matters"),
    getTranslations("admin.workspace"),
    listTags(),
    getMatterTagIds(matterId),
  ]);
  const matterTags = allTags.filter((tg) => tagIds.includes(tg.id));
  const {
    matter,
    steps,
    team,
    available,
    canManageTeam,
    types,
    template,
    fieldValues,
    requests,
    clients,
    deliverables,
    documents,
    invoices,
    nextAppointment,
    conversations,
    access,
    kpis,
  } = data;
  const tab: Tab = TABS.find((x) => x === sp.tab) ?? "overview";
  const isAdmin = role === "firm_admin";
  const today = new Date().toISOString().slice(0, 10);
  const notice = NOTICES.find((n) => n === sp.notice);
  const PARTS = ["steps", "team", "access", "requests", "deliverables"] as const;
  const partial =
    typeof sp.partial === "string"
      ? sp.partial
          .split(",")
          .filter((x): x is (typeof PARTS)[number] => (PARTS as readonly string[]).includes(x))
      : [];
  const accessNotice =
    sp.notice === "revoked"
      ? tm("revoked")
      : sp.notice === "granted"
        ? tm("granted")
        : sp.notice === "opened"
          ? partial.length
            ? tw("openedPartial", { items: partial.map((x) => tw(`parts.${x}`)).join(", ") })
            : tw("opened")
          : undefined;
  const active = access.filter((a) => !a.revoked_at);
  const revoked = access.filter((a) => a.revoked_at);
  const hidden = (
    <>
      <input type="hidden" name="matterId" value={matter.id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="tab" value={tab} />
    </>
  );
  const nextSteps = steps.filter((s) => !s.is_completed).slice(0, 3);
  const openDeliverables = deliverables.filter((d) => d.status === "planned" || d.status === "in_progress");
  const daysIdle = kpis.lastActivity
    ? Math.floor((Date.parse(today) - Date.parse(kpis.lastActivity.slice(0, 10))) / 86_400_000)
    : null;

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
        subtitle={[
          matter.display_number,
          types.find((ty) => ty.id === matter.matter_type_id)
            ? pick(
                locale,
                types.find((ty) => ty.id === matter.matter_type_id)!.name_fr,
                types.find((ty) => ty.id === matter.matter_type_id)!.name_en,
              )
            : matter.practice_area,
          team.length ? team.map((m) => personName(m.person)).join(", ") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <MatterStatusBadge status={matter.status} />
            {matter.is_mock ? <DemoDataBadge /> : null}
          </>
        }
      />
      <Notice
        message={notice ? t(`notices.${notice}`) : accessNotice}
        error={notice === "failed" || notice === "duplicate" || notice === "invalid" || partial.length > 0}
      />
      {matterTags.length ? (
        <p className="-mt-4 mb-4 flex flex-wrap gap-1.5">
          {matterTags.map((tg) => (
            <TagChip key={tg.id} label={pick(locale, tg.name_fr, tg.name_en)} color={tg.color} />
          ))}
        </p>
      ) : null}
      {matter.progress_percent !== null ? (
        <div className="mb-6 max-w-xl">
          <ProgressBar value={matter.progress_percent} label={t("progress")} />
        </div>
      ) : null}

      <TabLinks
        label={tw("tabsLabel")}
        items={TABS.map((x) => ({
          href: x === "overview" ? `/admin/matters/${matter.id}` : `/admin/matters/${matter.id}?tab=${x}`,
          label: tw(`tabs.${x}`),
          active: x === tab,
        }))}
      />

      {tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              icon={FileQuestion}
              label={tw("kpi.requests")}
              value={String(kpis.pendingRequests)}
              hint={kpis.overdueRequests ? tw("kpi.overdue", { count: kpis.overdueRequests }) : undefined}
              alert
              href={`/admin/matters/${matter.id}?tab=documents`}
            />
            <Kpi
              icon={MessageSquare}
              label={tw("kpi.unread")}
              value={String(kpis.unreadConversations)}
              href="/admin/messages"
            />
            <Kpi
              icon={Wallet}
              label={tw("kpi.balance")}
              value={formatMoney(kpis.balanceDue, locale, kpis.currency)}
            />
            <Kpi
              icon={CalendarClock}
              label={tw("kpi.nextAppointment")}
              value={nextAppointment ? formatDateTime(nextAppointment.starts_at, locale) : "—"}
              hint={nextAppointment?.title}
            />
            <Kpi
              icon={CheckCircle2}
              label={tw("kpi.deliverables")}
              value={String(openDeliverables.length)}
              href={`/admin/matters/${matter.id}?tab=steps`}
            />
            <Kpi
              icon={Clock}
              label={tw("kpi.lastActivity")}
              value={kpis.lastActivity ? formatRelative(kpis.lastActivity, locale) : "—"}
              hint={daysIdle !== null && daysIdle >= 14 ? tw("kpi.idle", { count: daysIdle }) : undefined}
              alert
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={tw("nextSteps")}>
              {nextSteps.length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noNextSteps")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {nextSteps.map((s) => (
                    <li key={s.id} className="flex items-start gap-2">
                      <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                      <span className="text-marine">{pick(locale, s.title, s.title_en)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={tw("upcomingDeliverables")}>
              {openDeliverables.length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noDeliverables")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {openDeliverables.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-marine">{d.title}</span>
                      <span
                        className={`text-xs ${d.due_date && d.due_date < today ? "font-semibold text-destructive" : "text-ink-muted"}`}
                      >
                        {d.due_date ? formatCalendarDate(d.due_date, locale) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={tw("overdueRequests")}>
              {requests.filter((r) => r.status === "pending" && r.due_date !== null && r.due_date < today)
                .length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noOverdue")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {requests
                    .filter((r) => r.status === "pending" && r.due_date !== null && r.due_date < today)
                    .map((r) => (
                      <li key={r.id} className="flex items-start gap-2">
                        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <span className="text-marine">
                          {pick(locale, r.title, r.title_en)} — {personName(r.person)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={tw("recentMessages")}>
              {conversations.length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noMessages")}</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/messages/${c.id}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-[2px] px-2 py-2 hover:bg-surface focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                      >
                        <span className="min-w-0 truncate text-marine">
                          {c.subject ?? tw("conversation")}
                        </span>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {c.last_message_at ? formatRelative(c.last_message_at, locale) : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={tw("invoices")} className="lg:col-span-2">
              {invoices.length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noInvoices")}</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 font-medium text-marine">{i.invoice_number}</span>
                      <span className="text-xs text-ink-muted">
                        {i.issued_at ? formatCalendarDate(i.issued_at, locale) : ""}
                      </span>
                      <span className="text-marine">{formatMoney(i.amount_total, locale, i.currency)}</span>
                      <StatusBadge
                        tone={
                          i.status === "paid" ? "completed" : i.status === "overdue" ? "urgent" : "active"
                        }
                        label={tw(`invoiceStatus.${i.status}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {tab === "steps" ? (
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
                          <Button
                            type="submit"
                            variant={s.is_completed ? "outline-gold" : "primary"}
                            size="sm"
                          >
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
          </div>
          <div className="space-y-6 lg:col-span-2">
            <SectionCard title={tw("deliverables")}>
              <p className="mb-4 text-sm text-ink-muted">{tw("deliverablesHelp")}</p>
              {deliverables.length === 0 ? (
                <p className="text-sm text-ink-muted">{tw("noDeliverables")}</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {deliverables.map((d) => (
                    <li key={d.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="text-sm font-medium text-marine">{d.title}</p>
                          {d.description ? <p className="text-xs text-ink-muted">{d.description}</p> : null}
                          <p className="text-xs text-ink-muted">
                            {[
                              d.due_date
                                ? tw("dueOn", { date: formatCalendarDate(d.due_date, locale) })
                                : null,
                              personName(team.find((m) => m.user_id === d.owner_id)?.person ?? null) !== "—"
                                ? personName(team.find((m) => m.user_id === d.owner_id)?.person ?? null)
                                : null,
                              d.visible_to_client ? tw("visibleToClient") : tw("internal"),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <StatusBadge
                          tone={
                            d.status === "delivered"
                              ? "completed"
                              : d.status === "cancelled"
                                ? "pending"
                                : d.due_date && d.due_date < today
                                  ? "urgent"
                                  : "active"
                          }
                          label={tw(`deliverableStatus.${d.status}`)}
                        />
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={deliverableStatusAction} className="flex flex-wrap items-end gap-2">
                          {hidden}
                          <input type="hidden" name="deliverableId" value={d.id} />
                          <label htmlFor={`deliverable-status-${d.id}`} className="sr-only">
                            {tw("statusLabel", { title: d.title })}
                          </label>
                          <select
                            id={`deliverable-status-${d.id}`}
                            name="status"
                            defaultValue={d.status}
                            className={`${fieldClass} h-9 w-auto`}
                          >
                            {deliverableStatuses.map((st) => (
                              <option key={st} value={st}>
                                {tw(`deliverableStatus.${st}`)}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="outline-gold" size="sm" className="h-9">
                            {tw("updateStatus")}
                          </Button>
                        </form>
                        <form action={removeDeliverableAction}>
                          {hidden}
                          <input type="hidden" name="deliverableId" value={d.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="h-9 text-destructive"
                            aria-label={tw("removeLabel", { title: d.title })}
                          >
                            {tw("remove")}
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addDeliverableAction} className="mt-6 space-y-3 border-t border-gray-100 pt-6">
                {hidden}
                <div className="space-y-1">
                  <label htmlFor="deliverable-title" className={labelClass}>
                    {tw("deliverableTitle")}
                  </label>
                  <input
                    id="deliverable-title"
                    name="title"
                    required
                    maxLength={200}
                    className={`${fieldClass} h-11`}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="deliverable-description" className={labelClass}>
                    {tw("deliverableDescription")}
                  </label>
                  <textarea
                    id="deliverable-description"
                    name="description"
                    rows={2}
                    maxLength={1000}
                    className={`${fieldClass} py-2`}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="deliverable-due" className={labelClass}>
                      {tw("deliverableDue")}
                    </label>
                    <input id="deliverable-due" name="dueDate" type="date" className={`${fieldClass} h-11`} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="deliverable-owner" className={labelClass}>
                      {tw("deliverableOwner")}
                    </label>
                    <select
                      id="deliverable-owner"
                      name="ownerId"
                      defaultValue=""
                      className={`${fieldClass} h-11`}
                    >
                      <option value="">{tw("noOwner")}</option>
                      {team.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {personName(m.person)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label
                  htmlFor="deliverable-visible"
                  className="flex min-h-10 items-center gap-2 text-sm text-marine"
                >
                  <input
                    id="deliverable-visible"
                    type="checkbox"
                    name="visible"
                    defaultChecked
                    className="size-4 accent-marine"
                  />
                  {tw("visibleToClient")}
                </label>
                <Button type="submit" variant="primary" size="sm">
                  {tw("addDeliverable")}
                </Button>
              </form>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
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
                        {r.fulfilled_document_id ? (
                          <p className="text-sm">
                            <a
                              href={`/api/documents/${r.fulfilled_document_id}/download`}
                              className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
                            >
                              {t("linkedDocument", {
                                name:
                                  documents.find((d) => d.id === r.fulfilled_document_id)?.display_name ??
                                  t("document"),
                              })}
                            </a>
                          </p>
                        ) : r.status === "pending" && documents.some((d) => d.folder !== "internal") ? (
                          <form action={linkRequestDocumentAction} className="flex flex-wrap items-end gap-2">
                            {hidden}
                            <input type="hidden" name="requestId" value={r.id} />
                            <div className="min-w-48 flex-1 space-y-1">
                              <label htmlFor={`link-${r.id}`} className="text-xs text-ink-muted">
                                {t("linkDocument")}
                              </label>
                              <select
                                id={`link-${r.id}`}
                                name="documentId"
                                required
                                className={`${fieldClass} h-9`}
                              >
                                {documents.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.display_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Button type="submit" variant="outline-gold" size="sm" className="h-9">
                              {t("linkSubmit")}
                            </Button>
                          </form>
                        ) : null}
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
                      {template && template.documents.length > 0
                        ? t("customDocumentTitle")
                        : t("requestTitle")}
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
          <SectionCard title={tw("matterDocuments")} className="lg:col-span-2">
            {documents.length === 0 ? (
              <p className="text-sm text-ink-muted">{tw("noDocuments")}</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="inline-flex min-h-6 min-w-0 flex-1 basis-40 items-center break-all text-marine hover:underline"
                    >
                      {d.display_name}
                    </a>
                    <StatusBadge
                      tone={d.folder === "internal" ? "pending" : "active"}
                      label={tw(`folders.${d.folder}`)}
                    />
                    <span className="text-xs text-ink-muted">
                      {d.uploaded_at ? formatDate(d.uploaded_at, locale) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
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
          <div className="space-y-6 lg:col-span-2">
            {isAdmin ? (
              <>
                <SectionCard title={tm("clientAccess")}>
                  {active.length === 0 ? (
                    <p className="text-sm text-ink-muted">{tm("noAccess")}</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {active.map((a) => (
                        <li key={a.id} className="space-y-3 py-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-marine">
                                {personName(a.profiles as unknown as Person)}
                              </p>
                              <p className="text-xs text-ink-muted">
                                {tm("grantedOn", { date: formatDate(a.granted_at, locale) })}
                              </p>
                            </div>
                            <StatusBadge
                              tone="active"
                              label={a.access_level === "read_write" ? tm("levelWrite") : tm("levelRead")}
                            />
                          </div>
                          <form action={revokeMatterAccessAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="matterId" value={matter.id} />
                            <input type="hidden" name="locale" value={locale} />
                            <div className="min-w-48 flex-1 space-y-1">
                              <label htmlFor={`reason-${a.id}`} className="text-xs text-ink-muted">
                                {tm("revokeReason")}
                              </label>
                              <input
                                id={`reason-${a.id}`}
                                name="reason"
                                required
                                maxLength={500}
                                className="h-9 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine"
                              />
                            </div>
                            <Button type="submit" variant="outline-gold" size="sm" className="h-9">
                              {tm("revoke")}
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {revoked.length > 0 ? (
                    <ul className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-xs text-ink-muted">
                      {revoked.map((a) => (
                        <li key={a.id}>
                          {personName(a.profiles as unknown as Person)} —{" "}
                          {tm("revokedOn", { date: formatDate(a.revoked_at!, locale) })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </SectionCard>

                <SectionCard title={tm("grant")}>
                  <GrantAccessForm action={grantMatterAccessAction} locale={locale} matterId={matter.id} />
                </SectionCard>
              </>
            ) : (
              <SectionCard title={tm("clientAccess")}>
                <ul className="space-y-1 text-sm">
                  {clients.map((c) => (
                    <li key={c.id} className="break-all text-marine">
                      {personName(c.person)}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-ink-muted">{tw("accessReadOnly")}</p>
              </SectionCard>
            )}
          </div>
        </div>
      ) : null}

      {tab === "details" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={tw("tags")}>
            <form action={setMatterTagsAction} className="space-y-3">
              {hidden}
              <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                <legend className="sr-only">{tw("tags")}</legend>
                {allTags
                  .filter((tg) => tg.is_active || tagIds.includes(tg.id))
                  .map((tg) => (
                    <label
                      key={tg.id}
                      htmlFor={`tag-${tg.id}`}
                      className="flex min-h-8 items-center gap-2 text-sm"
                    >
                      <input
                        id={`tag-${tg.id}`}
                        type="checkbox"
                        name="tagIds"
                        value={tg.id}
                        defaultChecked={tagIds.includes(tg.id)}
                        className="size-4 accent-marine"
                      />
                      <TagChip label={pick(locale, tg.name_fr, tg.name_en)} color={tg.color} />
                      {tg.visible_to_client ? (
                        <span className="text-xs text-ink-muted">{tw("tagVisible")}</span>
                      ) : null}
                    </label>
                  ))}
              </fieldset>
              <Button type="submit" variant="outline-gold" size="sm">
                {tw("saveTags")}
              </Button>
            </form>
          </SectionCard>
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
        </div>
      ) : null}
    </>
  );
}
