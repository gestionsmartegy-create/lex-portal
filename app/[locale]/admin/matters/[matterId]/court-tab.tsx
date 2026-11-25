import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RowActions } from "@/components/admin/row-actions";
import { EmptyState, SectionCard } from "@/components/portal/ui";
import { HelpTip } from "@/components/shared/help-tip";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatZoned, formatZonedTime, utcToZonedInput } from "@/lib/zoned-time";
import {
  importClioEntryAction,
  adjournCourtDateAction,
  courtDateStatusAction,
  saveCourtDateAction,
} from "@/server/actions/court-dates";
import {
  courtDateKinds,
  courtDateModes,
  defaultTimezoneFor,
  listCourtDates,
  partitionCourtDates,
  type CourtDate,
} from "@/server/services/court-dates";
import { pick } from "@/server/services/matter-templates";
import { listCourts, timezones } from "@/server/services/offices";
import { listClioEntriesForMatter } from "@/server/services/clio-agenda";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const areaClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";
const tzKey = (tz: string) => tz.replace("/", "_");

const STATUS_TONE: Record<CourtDate["status"], StatusTone> = {
  // Couleurs harmonisées (ADR 0033) : ambre = à confirmer, vert = confirmée.
  scheduled: "warning",
  confirmed: "completed",
  adjourned: "pending",
  cancelled: "pending",
  held: "active",
};

/**
 * Onglet « Cour » de l'espace Dossier (ADR 0025) : dates de cour du dossier, saisies ici puis écrites
 * dans Clio. Équipe du dossier ou firm_admin (le service revérifie l'accès). Aucun délai légal calculé.
 */
export async function CourtTab({
  locale,
  matterId,
  team,
  busyId,
}: {
  locale: string;
  matterId: string;
  team: { id: string; name: string }[];
  /** Date dont la confirmation a été arrêtée par un conflit Outlook : propose « Confirmer quand même ». */
  busyId?: string;
}) {
  const [t, tOffices, dates, courts, defaultTz, clio] = await Promise.all([
    getTranslations("admin.court"),
    getTranslations("admin.offices"),
    listCourtDates(matterId),
    listCourts(),
    defaultTimezoneFor(matterId),
    listClioEntriesForMatter(matterId),
  ]);
  const list = dates ?? [];
  const courtById = new Map(courts.map((c) => [c.id, c]));
  const nameById = new Map(team.map((m) => [m.id, m.name]));
  const { upcoming, history } = partitionCourtDates(list);
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="matterId" value={matterId} />
    </>
  );

  const fields = (d: CourtDate | null, prefix: string) => {
    const tz = d?.timezone ?? defaultTz;
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${prefix}-kind`} className={labelClass}>
            {t("fields.kind")}
          </label>
          <select
            id={`${prefix}-kind`}
            name="kind"
            defaultValue={d?.kind ?? "hearing"}
            className={fieldClass}
          >
            {courtDateKinds.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-court`} className={labelClass}>
            {t("fields.court")}
          </label>
          <select
            id={`${prefix}-court`}
            name="courtId"
            defaultValue={d?.court_id ?? ""}
            className={fieldClass}
          >
            <option value="">{t("fields.noCourt")}</option>
            {courts
              .filter((c) => c.is_active || c.id === d?.court_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name_fr, c.name_en)}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-start`} className={labelClass}>
            {t("fields.start")}
          </label>
          <input
            id={`${prefix}-start`}
            name="start"
            type="datetime-local"
            required
            defaultValue={d ? utcToZonedInput(d.starts_at, d.timezone) : undefined}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-end`} className={labelClass}>
            {t("fields.end")}
          </label>
          <input
            id={`${prefix}-end`}
            name="end"
            type="datetime-local"
            defaultValue={d?.ends_at ? utcToZonedInput(d.ends_at, d.timezone) : undefined}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-tz`} className={labelClass}>
            {t("fields.timezone")}
          </label>
          <select id={`${prefix}-tz`} name="timezone" defaultValue={tz} className={fieldClass}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {tOffices(`timezones.${tzKey(z)}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-muted">{t("fields.timezoneHelp")}</p>
        </div>
        <label
          htmlFor={`${prefix}-allday`}
          className="flex min-h-10 items-center gap-2 self-end text-sm text-marine"
        >
          <input
            id={`${prefix}-allday`}
            type="checkbox"
            name="allDay"
            defaultChecked={d?.all_day}
            className="size-4 accent-marine"
          />
          {t("fields.allDay")}
        </label>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-room`} className={labelClass}>
            {t("fields.room")}
          </label>
          <input
            id={`${prefix}-room`}
            name="room"
            maxLength={80}
            defaultValue={d?.room ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-judge`} className={labelClass}>
            {t("fields.judge")}
          </label>
          <input
            id={`${prefix}-judge`}
            name="judge"
            maxLength={120}
            defaultValue={d?.judge ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-docket`} className={labelClass}>
            {t("fields.docket")}
          </label>
          <input
            id={`${prefix}-docket`}
            name="docketNumber"
            maxLength={80}
            defaultValue={d?.docket_number ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-mode`} className={labelClass}>
            {t("fields.mode")}
          </label>
          <select
            id={`${prefix}-mode`}
            name="mode"
            defaultValue={d?.mode ?? "in_person"}
            className={fieldClass}
          >
            {courtDateModes.map((m) => (
              <option key={m} value={m}>
                {t(`modes.${m}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`${prefix}-link`} className={labelClass}>
            {t("fields.link")}
          </label>
          <input
            id={`${prefix}-link`}
            name="virtualLink"
            type="url"
            maxLength={500}
            placeholder="https://"
            defaultValue={d?.virtual_link ?? ""}
            className={fieldClass}
          />
        </div>
        {team.length ? (
          <fieldset className="sm:col-span-2">
            <legend className={labelClass}>{t("fields.attendees")}</legend>
            <div className="flex flex-wrap gap-x-4">
              {team.map((m) => (
                <label
                  key={m.id}
                  htmlFor={`${prefix}-att-${m.id}`}
                  className="flex min-h-9 items-center gap-2 text-sm"
                >
                  <input
                    id={`${prefix}-att-${m.id}`}
                    type="checkbox"
                    name="attendeeIds"
                    value={m.id}
                    defaultChecked={d?.attendeeIds.includes(m.id)}
                    className="size-4 accent-marine"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`${prefix}-notes`} className={labelClass}>
            {t("fields.notes")}
          </label>
          <textarea
            id={`${prefix}-notes`}
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={d?.notes ?? ""}
            className={areaClass}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`${prefix}-instr`} className={labelClass}>
            {t("fields.instructions")}
          </label>
          <textarea
            id={`${prefix}-instr`}
            name="clientInstructions"
            rows={2}
            maxLength={2000}
            defaultValue={d?.client_instructions ?? ""}
            className={areaClass}
          />
        </div>
        <label
          htmlFor={`${prefix}-visible`}
          className="flex min-h-9 items-center gap-2 text-sm text-marine sm:col-span-2"
        >
          <input
            id={`${prefix}-visible`}
            type="checkbox"
            name="visibleToClient"
            defaultChecked={d?.visible_to_client}
            className="size-4 accent-marine"
          />
          {t("fields.visible")}
        </label>
      </div>
    );
  };

  const item = (d: CourtDate) => {
    const court = d.court_id ? courtById.get(d.court_id) : undefined;
    const open = d.status === "scheduled" || d.status === "confirmed";
    const when = `${formatZoned(d.starts_at, d.timezone, locale, d.all_day)}${
      d.ends_at && !d.all_day ? ` – ${formatZonedTime(d.ends_at, d.timezone, locale)}` : ""
    }`;
    const replaced = d.replaces_id ? list.find((x) => x.id === d.replaces_id) : undefined;
    return (
      <li key={d.id} className="py-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            <p className="font-medium text-marine">
              {t(`kinds.${d.kind}`)} · {when}
            </p>
            <p className="text-sm break-words text-ink-muted">
              {[
                court ? pick(locale, court.name_fr, court.name_en) : null,
                d.room ? t("roomValue", { room: d.room }) : null,
                d.judge,
                d.docket_number ? t("docketValue", { docket: d.docket_number }) : null,
                t(`modes.${d.mode}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {d.attendeeIds.length ? (
              <p className="text-xs text-ink-muted">
                {t("attendeesValue", {
                  names: d.attendeeIds.map((id) => nameById.get(id) ?? "—").join(", "),
                })}
              </p>
            ) : null}
            {replaced ? (
              <p className="text-xs text-ink-muted">
                {t("replaces", {
                  when: formatZoned(replaced.starts_at, replaced.timezone, locale, replaced.all_day),
                })}
              </p>
            ) : null}
            {d.status === "cancelled" && d.cancel_reason ? (
              <p className="text-xs text-ink-muted">{t("cancelReasonValue", { reason: d.cancel_reason })}</p>
            ) : null}
            {d.visible_to_client ? <p className="text-xs text-ink-muted">{t("visibleValue")}</p> : null}
            {d.id === busyId && d.status === "scheduled" ? (
              <div
                role="alert"
                className="mt-2 space-y-2 rounded-[2px] border border-danger-ink/30 bg-danger-ink/5 p-3"
              >
                <p className="text-sm font-medium text-danger-ink">{t("busyWarning")}</p>
                <form action={courtDateStatusAction}>
                  {hidden}
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value="confirmed" />
                  <input type="hidden" name="override" value="1" />
                  <Button type="submit" variant="outline" size="sm" className="h-9">
                    {t("confirmAnyway")}
                  </Button>
                </form>
              </div>
            ) : null}
            <p
              className={
                d.clio_sync_status === "failed"
                  ? "text-xs font-semibold text-danger-ink"
                  : "text-xs text-ink-muted"
              }
            >
              {t(`sync.${d.clio_sync_status}`)}
            </p>
          </div>
          <StatusBadge tone={STATUS_TONE[d.status]} label={t(`statuses.${d.status}`)} />
          {open ? (
            <RowActions
              moreLabel={t("moreActions")}
              closeLabel={t("closePanel")}
              primary={
                d.status === "scheduled" ? (
                  <form action={courtDateStatusAction}>
                    {hidden}
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="status" value="confirmed" />
                    <Button type="submit" variant="primary" size="sm" className="h-9">
                      {t("confirm")}
                    </Button>
                  </form>
                ) : null
              }
              panels={[
                {
                  key: "edit",
                  label: t("edit"),
                  content: (
                    <form action={saveCourtDateAction} className="space-y-3">
                      {hidden}
                      <input type="hidden" name="id" value={d.id} />
                      {fields(d, `e-${d.id}`)}
                      <p className="text-xs text-ink-muted">{t("reconfirmHelp")}</p>
                      <Button type="submit" variant="primary" size="sm">
                        {t("save")}
                      </Button>
                    </form>
                  ),
                },
                {
                  key: "adjourn",
                  label: t("adjourn"),
                  content: (
                    <form action={adjournCourtDateAction} className="space-y-3">
                      {hidden}
                      <input type="hidden" name="id" value={d.id} />
                      <p className="text-sm text-ink-muted">{t("adjournHelp")}</p>
                      {fields({ ...d, starts_at: d.starts_at, status: "scheduled" }, `a-${d.id}`)}
                      <Button type="submit" variant="primary" size="sm">
                        {t("adjournSubmit")}
                      </Button>
                    </form>
                  ),
                },
                {
                  key: "held",
                  label: t("markHeld"),
                  content: (
                    <form action={courtDateStatusAction} className="flex flex-wrap items-center gap-3">
                      {hidden}
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="status" value="held" />
                      <p className="text-sm text-ink-muted">{t("markHeldHelp")}</p>
                      <Button type="submit" variant="primary" size="sm">
                        {t("markHeld")}
                      </Button>
                    </form>
                  ),
                },
                {
                  key: "cancel",
                  label: t("cancel"),
                  danger: true,
                  content: (
                    <form action={courtDateStatusAction} className="flex flex-wrap items-end gap-2">
                      {hidden}
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <div className="min-w-0 flex-1 basis-60 space-y-1">
                        <label htmlFor={`c-${d.id}-reason`} className={labelClass}>
                          {t("cancelReason")}
                        </label>
                        <input
                          id={`c-${d.id}-reason`}
                          name="reason"
                          required
                          maxLength={500}
                          className={fieldClass}
                        />
                      </div>
                      <Button type="submit" variant="outline-marine" size="sm" className="h-10">
                        {t("cancelSubmit")}
                      </Button>
                    </form>
                  ),
                },
              ]}
            />
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("upcoming")}
        help={
          <HelpTip label={t("helpLabel")}>
            {t("noLegalDeadlines")} {t("clioHelp")}
          </HelpTip>
        }
      >
        <details className="mb-4 border-b border-gray-100 pb-4">
          <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine-light focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {t("add")}
          </summary>
          <form action={saveCourtDateAction} className="mt-3 space-y-3">
            {hidden}
            {fields(null, "n")}
            <Button type="submit" variant="primary" size="sm">
              {t("create")}
            </Button>
          </form>
        </details>
        {upcoming.length === 0 ? (
          <EmptyState icon={Gavel} message={t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">{upcoming.map(item)}</ul>
        )}
      </SectionCard>
      {clio?.linked ? (
        <SectionCard
          title={t("clioAgenda.title")}
          help={<HelpTip label={t("clioAgenda.helpLabel")}>{t("clioAgenda.help")}</HelpTip>}
        >
          {"unavailable" in clio && clio.unavailable ? (
            <p className="text-sm text-ink-muted">{t("clioAgenda.unavailable")}</p>
          ) : clio.entries.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("clioAgenda.none")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {clio.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-semibold break-words text-marine">
                      {e.summary || t("clioAgenda.untitled")}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {[formatZoned(e.startAt, defaultTz, locale, e.allDay), e.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {e.imported ? (
                    <StatusBadge tone="completed" label={t("clioAgenda.imported")} />
                  ) : (
                    <form action={importClioEntryAction} className="flex flex-wrap items-center gap-2">
                      {hidden}
                      <input type="hidden" name="entryId" value={e.id} />
                      <label htmlFor={`clio-kind-${e.id}`} className="sr-only">
                        {t("clioAgenda.kindFor", { title: e.summary || t("clioAgenda.untitled") })}
                      </label>
                      <select
                        id={`clio-kind-${e.id}`}
                        name="kind"
                        defaultValue={e.suggestedKind ?? "hearing"}
                        className="h-9 rounded-[2px] border border-gray-200 bg-white px-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
                      >
                        {(
                          [
                            "hearing",
                            "trial",
                            "motion",
                            "case_conference",
                            "appearance",
                            "filing_deadline",
                          ] as const
                        ).map((k) => (
                          <option key={k} value={k}>
                            {t(`kinds.${k}`)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="submit"
                        variant="outline-marine"
                        size="sm"
                        aria-label={t("clioAgenda.importFor", { title: e.summary })}
                      >
                        {t("clioAgenda.import")}
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
      {history.length ? (
        <SectionCard title={t("history")}>
          <ul className="divide-y divide-gray-100">{history.map(item)}</ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
