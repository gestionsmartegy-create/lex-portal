import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, InfoNote, SectionCard } from "@/components/portal/ui";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatZoned, formatZonedTime, utcToZonedInput } from "@/lib/zoned-time";
import {
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

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const areaClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const tzKey = (tz: string) => tz.replace("/", "_");

const STATUS_TONE: Record<CourtDate["status"], StatusTone> = {
  scheduled: "urgent",
  confirmed: "completed",
  adjourned: "pending",
  cancelled: "pending",
  held: "active",
};
const SYNC_TONE: Record<CourtDate["clio_sync_status"], StatusTone> = {
  synced: "completed",
  pending: "pending",
  syncing: "pending",
  failed: "urgent",
  not_applicable: "pending",
};

/**
 * Onglet « Cour » de l'espace Dossier (ADR 0025) : dates de cour du dossier, saisies ici puis écrites
 * dans Clio. Équipe du dossier ou firm_admin (le service revérifie l'accès). Aucun délai légal calculé.
 */
export async function CourtTab({
  locale,
  matterId,
  team,
}: {
  locale: string;
  matterId: string;
  team: { id: string; name: string }[];
}) {
  const [t, tOffices, dates, courts, defaultTz] = await Promise.all([
    getTranslations("admin.court"),
    getTranslations("admin.offices"),
    listCourtDates(matterId),
    listCourts(),
    defaultTimezoneFor(matterId),
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={STATUS_TONE[d.status]} label={t(`statuses.${d.status}`)} />
            <StatusBadge tone={SYNC_TONE[d.clio_sync_status]} label={t(`sync.${d.clio_sync_status}`)} />
          </div>
        </div>
        {open ? (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {d.status === "scheduled" ? (
              <form action={courtDateStatusAction}>
                {hidden}
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="status" value="confirmed" />
                <Button type="submit" variant="primary" size="sm">
                  {t("confirm")}
                </Button>
              </form>
            ) : null}
            <form action={courtDateStatusAction}>
              {hidden}
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="status" value="held" />
              <Button type="submit" variant="outline-gold" size="sm">
                {t("markHeld")}
              </Button>
            </form>
            <details className="w-full">
              <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                {t("edit")}
              </summary>
              <form action={saveCourtDateAction} className="mt-3 space-y-3">
                {hidden}
                <input type="hidden" name="id" value={d.id} />
                {fields(d, `e-${d.id}`)}
                <p className="text-xs text-ink-muted">{t("reconfirmHelp")}</p>
                <Button type="submit" variant="primary" size="sm">
                  {t("save")}
                </Button>
              </form>
            </details>
            <details className="w-full">
              <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                {t("adjourn")}
              </summary>
              <form action={adjournCourtDateAction} className="mt-3 space-y-3">
                {hidden}
                <input type="hidden" name="id" value={d.id} />
                <p className="text-sm text-ink-muted">{t("adjournHelp")}</p>
                {fields({ ...d, starts_at: d.starts_at, status: "scheduled" }, `a-${d.id}`)}
                <Button type="submit" variant="primary" size="sm">
                  {t("adjournSubmit")}
                </Button>
              </form>
            </details>
            <details className="w-full">
              <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                {t("cancel")}
              </summary>
              <form action={courtDateStatusAction} className="mt-3 flex flex-wrap items-end gap-2">
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
                <Button type="submit" variant="outline-gold" size="sm" className="h-10">
                  {t("cancelSubmit")}
                </Button>
              </form>
            </details>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <InfoNote>{t("noLegalDeadlines")}</InfoNote>
      <SectionCard title={t("upcoming")}>
        {upcoming.length === 0 ? (
          <EmptyState icon={Gavel} message={t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">{upcoming.map(item)}</ul>
        )}
        <details className="mt-4 border-t border-gray-100 pt-4">
          <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm font-semibold text-gold-ink hover:underline">
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
      </SectionCard>
      {history.length ? (
        <SectionCard title={t("history")}>
          <ul className="divide-y divide-gray-100">{history.map(item)}</ul>
        </SectionCard>
      ) : null}
      <p className="text-xs text-ink-muted">{t("clioHelp")}</p>
    </div>
  );
}
