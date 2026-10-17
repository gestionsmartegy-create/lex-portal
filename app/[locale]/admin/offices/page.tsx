import { Building2, Landmark } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { EmptyState, InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  calendarViewerAction,
  saveCourtAction,
  saveOfficeAction,
  setActiveAction,
  staffOfficesAction,
} from "@/server/actions/offices";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { pick } from "@/server/services/matter-templates";
import {
  courtProvinces,
  listCalendarViewers,
  listCourts,
  listOffices,
  listStaffOffices,
  provinces,
  timezones,
  type Court,
  type Office,
} from "@/server/services/offices";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const NOTICES = ["saved", "archived", "restored", "duplicate", "failed", "invalid"] as const;
const tzKey = (tz: string) => tz.replace("/", "_");

/**
 * Bureaux et tribunaux (ADR 0024) : firm_admin. Bureaux (Ottawa, Halifax, Montréal), personnel par bureau,
 * liste des tribunaux. On archive, on ne supprime jamais. Le bureau ne donne aucun droit sur les dossiers.
 */
export default async function OfficesPage({ params, searchParams }: PageProps<"/[locale]/admin/offices">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [t, offices, courts, links, viewers, { data: staff }] = await Promise.all([
    getTranslations("admin.offices"),
    listOffices(),
    listCourts(),
    listStaffOffices(),
    listCalendarViewers(),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .order("last_name"),
  ]);
  const notice = NOTICES.find((n) => n === sp.notice);
  const activeOffices = offices.filter((o) => o.is_active);
  const person = (p: { first_name: string | null; last_name: string | null; email: string }) =>
    [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
  const hidden = <input type="hidden" name="locale" value={locale} />;

  const officeFields = (o: Office | null, prefix: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      <div className="space-y-1">
        <label htmlFor={`${prefix}-fr`} className={labelClass}>
          {t("fields.nameFr")}
        </label>
        <input
          id={`${prefix}-fr`}
          name="nameFr"
          required
          maxLength={80}
          defaultValue={o?.name_fr}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-en`} className={labelClass}>
          {t("fields.nameEn")}
        </label>
        <input
          id={`${prefix}-en`}
          name="nameEn"
          required
          maxLength={80}
          defaultValue={o?.name_en}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-city`} className={labelClass}>
          {t("fields.city")}
        </label>
        <input
          id={`${prefix}-city`}
          name="city"
          required
          maxLength={80}
          defaultValue={o?.city}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-prov`} className={labelClass}>
          {t("fields.province")}
        </label>
        <select
          id={`${prefix}-prov`}
          name="province"
          defaultValue={o?.province ?? "NS"}
          className={fieldClass}
        >
          {provinces.map((p) => (
            <option key={p} value={p}>
              {t(`provinces.${p}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-tz`} className={labelClass}>
          {t("fields.timezone")}
        </label>
        <select
          id={`${prefix}-tz`}
          name="timezone"
          defaultValue={o?.timezone ?? "America/Halifax"}
          className={fieldClass}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {t(`timezones.${tzKey(tz)}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-addr`} className={labelClass}>
          {t("fields.address")}
        </label>
        <input
          id={`${prefix}-addr`}
          name="address"
          maxLength={300}
          defaultValue={o?.address ?? ""}
          className={fieldClass}
        />
      </div>
    </div>
  );

  const courtFields = (c: Court | null, prefix: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="space-y-1">
        <label htmlFor={`${prefix}-fr`} className={labelClass}>
          {t("fields.nameFr")}
        </label>
        <input
          id={`${prefix}-fr`}
          name="nameFr"
          required
          maxLength={150}
          defaultValue={c?.name_fr}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-en`} className={labelClass}>
          {t("fields.nameEn")}
        </label>
        <input
          id={`${prefix}-en`}
          name="nameEn"
          required
          maxLength={150}
          defaultValue={c?.name_en}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-prov`} className={labelClass}>
          {t("fields.jurisdiction")}
        </label>
        <select
          id={`${prefix}-prov`}
          name="province"
          defaultValue={c?.province ?? "NS"}
          className={fieldClass}
        >
          {courtProvinces.map((p) => (
            <option key={p} value={p}>
              {t(`provinces.${p}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-tz`} className={labelClass}>
          {t("fields.timezone")}
        </label>
        <select id={`${prefix}-tz`} name="timezone" defaultValue={c?.timezone ?? ""} className={fieldClass}>
          <option value="">{t("fields.timezoneFederal")}</option>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {t(`timezones.${tzKey(tz)}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`${prefix}-addr`} className={labelClass}>
          {t("fields.address")}
        </label>
        <input
          id={`${prefix}-addr`}
          name="address"
          maxLength={300}
          defaultValue={c?.address ?? ""}
          className={fieldClass}
        />
      </div>
    </div>
  );

  const archiveForm = (kind: "office" | "court", id: string, active: boolean, label: string) => (
    <form action={setActiveAction}>
      {hidden}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button
        type="submit"
        variant="outline-gold"
        size="sm"
        aria-label={`${active ? t("archive") : t("restore")} : ${label}`}
      >
        {active ? t("archive") : t("restore")}
      </Button>
    </form>
  );

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "duplicate" || notice === "invalid"}
      />

      <SectionCard title={t("offices")} className="mb-6">
        <InfoNote>{t("noRights")}</InfoNote>
        {offices.length === 0 ? (
          <EmptyState icon={Building2} message={t("noOffice")} />
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {offices.map((o) => {
              const name = pick(locale, o.name_fr, o.name_en);
              return (
                <li key={o.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="font-medium text-marine">{name}</p>
                      <p className="text-xs break-words text-ink-muted">
                        {[
                          o.city,
                          t(`provinces.${o.province}`),
                          t(`timezones.${tzKey(o.timezone)}`),
                          o.address,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {o.is_active ? null : <StatusBadge tone="pending" label={t("archived")} />}
                    {archiveForm("office", o.id, o.is_active, name)}
                  </div>
                  <details className="mt-2">
                    <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                      {t("edit", { name })}
                    </summary>
                    <form action={saveOfficeAction} className="mt-3 space-y-3">
                      {hidden}
                      {officeFields(o, `o-${o.id}`)}
                      <Button type="submit" variant="primary" size="sm">
                        {t("save")}
                      </Button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-4 border-t border-gray-100 pt-4">
          <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm font-semibold text-gold-ink hover:underline">
            {t("addOffice")}
          </summary>
          <form action={saveOfficeAction} className="mt-3 space-y-3">
            {hidden}
            {officeFields(null, "o-new")}
            <Button type="submit" variant="primary" size="sm">
              {t("create")}
            </Button>
          </form>
        </details>
      </SectionCard>

      <SectionCard title={t("staff")} className="mb-6">
        <p className="mb-4 text-sm text-ink-muted">{t("staffHelp")}</p>
        <ul className="divide-y divide-gray-100">
          {(staff ?? []).map((p) => {
            const mine = links.filter((l) => l.user_id === p.id);
            const primary = mine.find((l) => l.is_primary)?.office_id ?? "";
            const name = person(p);
            return (
              <li key={p.id} className="py-4">
                <form action={staffOfficesAction} className="flex flex-wrap items-end gap-3">
                  {hidden}
                  <input type="hidden" name="userId" value={p.id} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium break-words text-marine">{name}</p>
                  </div>
                  <div className="w-full space-y-1 sm:w-56">
                    <label htmlFor={`sp-${p.id}`} className={labelClass}>
                      {t("primary")}
                    </label>
                    <select id={`sp-${p.id}`} name="primaryId" defaultValue={primary} className={fieldClass}>
                      <option value="">{t("none")}</option>
                      {activeOffices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {pick(locale, o.name_fr, o.name_en)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset className="w-full sm:w-auto">
                    <legend className={labelClass}>{t("others")}</legend>
                    <div className="flex flex-wrap gap-x-4">
                      {activeOffices.map((o) => (
                        <label
                          key={o.id}
                          htmlFor={`so-${p.id}-${o.id}`}
                          className="flex min-h-9 items-center gap-2 text-sm"
                        >
                          <input
                            id={`so-${p.id}-${o.id}`}
                            type="checkbox"
                            name="otherIds"
                            value={o.id}
                            defaultChecked={mine.some((l) => l.office_id === o.id && !l.is_primary)}
                            className="size-4 accent-marine"
                          />
                          {pick(locale, o.name_fr, o.name_en)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Button
                    type="submit"
                    variant="outline-gold"
                    size="sm"
                    className="h-10"
                    aria-label={`${t("save")} : ${name}`}
                  >
                    {t("save")}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title={t("viewers.title")} className="mb-6">
        <p className="mb-4 text-sm text-ink-muted">{t("viewers.help")}</p>
        <ul className="divide-y divide-gray-100">
          {(staff ?? []).map((p) => {
            const on = viewers.includes(p.id);
            const name = person(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 basis-48 font-medium break-words text-marine">{name}</span>
                {on ? <StatusBadge tone="completed" label={t("viewers.on")} /> : null}
                <form action={calendarViewerAction}>
                  {hidden}
                  <input type="hidden" name="userId" value={p.id} />
                  <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                  <Button
                    type="submit"
                    variant="outline-gold"
                    size="sm"
                    aria-label={`${on ? t("viewers.remove") : t("viewers.add")} : ${name}`}
                  >
                    {on ? t("viewers.remove") : t("viewers.add")}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title={t("courts")}>
        <InfoNote>{t("courtsHelp")}</InfoNote>
        {courts.length === 0 ? (
          <EmptyState icon={Landmark} message={t("noCourt")} />
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {courts.map((c) => {
              const name = pick(locale, c.name_fr, c.name_en);
              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="text-sm font-medium text-marine">{name}</p>
                      <p className="text-xs break-words text-ink-muted">
                        {[
                          t(`provinces.${c.province}`),
                          c.timezone ? t(`timezones.${tzKey(c.timezone)}`) : t("fields.timezoneFederal"),
                          c.address,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {c.is_active ? null : <StatusBadge tone="pending" label={t("archived")} />}
                    {archiveForm("court", c.id, c.is_active, name)}
                  </div>
                  <details className="mt-2">
                    <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm text-gold-ink hover:underline">
                      {t("edit", { name })}
                    </summary>
                    <form action={saveCourtAction} className="mt-3 space-y-3">
                      {hidden}
                      {courtFields(c, `c-${c.id}`)}
                      <Button type="submit" variant="primary" size="sm">
                        {t("save")}
                      </Button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-4 border-t border-gray-100 pt-4">
          <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm font-semibold text-gold-ink hover:underline">
            {t("addCourt")}
          </summary>
          <form action={saveCourtAction} className="mt-3 space-y-3">
            {hidden}
            {courtFields(null, "c-new")}
            <Button type="submit" variant="primary" size="sm">
              {t("create")}
            </Button>
          </form>
        </details>
      </SectionCard>
    </>
  );
}
