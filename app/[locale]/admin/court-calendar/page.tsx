import { AlertTriangle, ChevronLeft, ChevronRight, Gavel } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import {
  calendarDomains,
  calendarFiltersSchema,
  calendarViews,
  daysOf,
  getCourtCalendar,
  todayIn,
  type CalendarFilters,
  type CalendarItem,
} from "@/server/services/court-calendar";
import { courtDateKinds } from "@/server/services/court-dates";
import { pick } from "@/server/services/matter-templates";
import { listCourts, listOffices } from "@/server/services/offices";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
/** Couleur pleine par domaine (légende au-dessus du calendrier), texte lisible sur chaque fond. */
const DOMAIN_CHIP: Record<(typeof calendarDomains)[number], string> = {
  immigration: "bg-dom-immigration text-white border-dom-immigration",
  legal: "bg-dom-legal text-white border-dom-legal",
  business: "bg-dom-business text-marine border-dom-business",
  advisory: "bg-dom-advisory text-white border-dom-advisory",
  other: "bg-dom-other text-white border-dom-other",
};
const DOMAIN_DOT: Record<(typeof calendarDomains)[number], string> = {
  immigration: "bg-dom-immigration",
  legal: "bg-dom-legal",
  business: "bg-dom-business",
  advisory: "bg-dom-advisory",
  other: "bg-dom-other",
};

const intlLocale = (locale: string) => (locale === "fr" ? "fr-CA" : "en-CA");

/** Heure d'une date dans le fuseau du tribunal, avec l'abréviation du fuseau (« 9:30 a.m. EST »). */
const timeOf = (i: CalendarItem, locale: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: i.timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(i.startsAt));

const dayLabel = (d: string, locale: string, style: "long" | "short") =>
  new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "UTC",
    weekday: style,
    day: "numeric",
    month: style === "long" ? "long" : "short",
    ...(style === "long" ? { year: "numeric" } : {}),
  }).format(new Date(`${d}T12:00:00Z`));

/**
 * Calendrier de cour (ADR 0026, lot 3) : vue générale (firm_admin) ou dossiers de ses équipes (RLS),
 * en mois, semaine ou liste ; filtres par bureau, avocat, tribunal, sorte ; conflits signalés.
 */
export default async function CourtCalendarPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/court-calendar">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const filters = calendarFiltersSchema.parse({
    view: sp.view || undefined,
    date: sp.date || undefined,
    office: sp.office || undefined,
    lawyer: sp.lawyer || undefined,
    court: sp.court || undefined,
    kind: sp.kind || undefined,
    status: sp.status || undefined,
    mine: sp.mine || undefined,
  });
  const supabase = await createSupabaseServerClient();
  const [t, tCourt, data, offices, courts, { data: staff }] = await Promise.all([
    getTranslations("admin.courtCalendar"),
    getTranslations("admin.court"),
    getCourtCalendar(filters),
    listOffices(),
    listCourts(),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .order("last_name")
      .limit(500),
  ]);
  if (!data) return null;
  const { items, period, anchor, truncated, scope } = data;
  const courtById = new Map(courts.map((c) => [c.id, c]));
  const officeById = new Map(offices.map((o) => [o.id, o]));
  const today = todayIn();

  /** Lien vers une autre vue ou période en gardant les filtres. */
  const href = (over: Partial<CalendarFilters>) => {
    const q = new URLSearchParams();
    const merged = { ...filters, ...over };
    for (const [k, v] of Object.entries(merged))
      if (v && !(k === "status" && v === "active") && !(k === "view" && v === "list")) q.set(k, String(v));
    const s = q.toString();
    return `/admin/court-calendar${s ? `?${s}` : ""}`;
  };
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) byDay.set(i.localDay, [...(byDay.get(i.localDay) ?? []), i]);

  const chip = (i: CalendarItem, compact: boolean) => {
    const court = i.courtId ? courtById.get(i.courtId) : undefined;
    const tone = `${DOMAIN_CHIP[i.domain]} ${i.status === "scheduled" ? "border-dashed border-2 border-white/80" : ""} ${
      i.conflict ? "ring-[3px] ring-black ring-offset-1" : ""
    }`;
    const body = (
      <>
        <span className="font-semibold">{i.allDay ? t("allDay") : timeOf(i, locale)}</span>{" "}
        {tCourt(`kinds.${i.kind}`)} · {i.matterNumber || i.matterTitle || t("unnamedMatter")}
        {!compact && court ? (
          <span className="block opacity-90">{pick(locale, court.name_fr, court.name_en)}</span>
        ) : null}
        {i.status === "scheduled" ? <span className="block font-semibold">{t("toConfirm")}</span> : null}
        {i.conflict ? (
          <span className="flex items-center gap-1 font-semibold">
            <AlertTriangle aria-hidden className="size-3" />
            {i.busyConflict ? t("busyConflict") : t("conflict")}
          </span>
        ) : null}
        {i.clioChange ? <span className="block font-semibold">{t(`clioChange.${i.clioChange}`)}</span> : null}
        <span className="sr-only">{` · ${t(`domains.${i.domain}`)}`}</span>
        {!i.onTeam ? <span className="block opacity-90">{t("otherTeam")}</span> : null}
      </>
    );
    // Hors de ses équipes (adjoint·e désigné·e) : lecture seule, le dossier ne s'ouvre pas.
    return i.onTeam ? (
      <Link
        key={i.id}
        href={`/admin/matters/${i.matterId}?tab=court`}
        className={`block rounded-[2px] border px-2 py-1 text-xs hover:underline ${tone}`}
      >
        {body}
      </Link>
    ) : (
      <div key={i.id} className={`block rounded-[2px] border px-2 py-1 text-xs ${tone}`}>
        {body}
      </div>
    );
  };

  const list = (
    <div className="space-y-4">
      {[...byDay.entries()].map(([d, dayItems]) => (
        <section key={d} aria-labelledby={`d-${d}`}>
          <h2
            id={`d-${d}`}
            className={`mb-2 text-sm font-bold ${d === today ? "text-gold-ink" : "text-marine"}`}
          >
            {dayLabel(d, locale, "long")}
            {d === today ? ` · ${t("today")}` : ""}
          </h2>
          <ul className="space-y-2">
            {dayItems.map((i) => {
              const court = i.courtId ? courtById.get(i.courtId) : undefined;
              const office = i.officeId ? officeById.get(i.officeId) : undefined;
              return (
                <li key={i.id}>
                  {chip(i, true)}
                  <p className="mt-0.5 pl-2 text-xs break-words text-ink-muted">
                    {[
                      i.matterTitle,
                      court ? pick(locale, court.name_fr, court.name_en) : null,
                      i.room ? tCourt("roomValue", { room: i.room }) : null,
                      office ? pick(locale, office.name_fr, office.name_en) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  const grid = (days: string[]) => (
    <section className="hidden md:block" aria-label={t("gridLabel")}>
      <div className="grid grid-cols-7 border-t border-l border-gray-200">
        {days.slice(0, 7).map((d) => (
          <div
            key={`h-${d}`}
            aria-hidden="true"
            className="border-r border-b border-gray-200 bg-cream px-2 py-1 text-xs font-semibold text-marine uppercase"
          >
            {new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", weekday: "short" }).format(
              new Date(`${d}T12:00:00Z`),
            )}
          </div>
        ))}
        {days.map((d) => {
          const outside = filters.view === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
          return (
            <div
              key={d}

              className={`min-h-28 space-y-1 border-r border-b border-gray-200 p-1.5 ${outside ? "bg-gray-50" : "bg-white"}`}
            >
              <p
                className={`text-xs ${d === today ? "font-bold text-gold-ink" : outside ? "text-ink-muted" : "text-marine"}`}
              >
                <span aria-hidden="true">{Number(d.slice(8))}</span>
                <span className="sr-only">{dayLabel(d, locale, "long")}</span>
              </p>
              {(byDay.get(d) ?? []).map((i) => chip(i, filters.view === "month"))}
            </div>
          );
        })}
      </div>
    </section>
  );

  const periodLabel =
    filters.view === "month"
      ? new Intl.DateTimeFormat(intlLocale(locale), {
          timeZone: "UTC",
          month: "long",
          year: "numeric",
        }).format(new Date(`${anchor.slice(0, 8)}15T12:00:00Z`))
      : `${dayLabel(period.start, locale, "short")} – ${dayLabel(period.end, locale, "short")}`;
  const person = (p: { first_name: string | null; last_name: string | null; email: string }) =>
    [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

  return (
    <>
      <PageHeader title={t("title")} subtitle={scope === "firm" ? t("subtitleFirm") : t("subtitleTeams")} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label={t("viewLabel")} className="flex gap-2">
          {calendarViews.map((v) => (
            <Button key={v} asChild variant={filters.view === v ? "primary" : "outline-gold"} size="sm">
              <Link href={href({ view: v })} aria-current={filters.view === v ? "page" : undefined}>
                {t(`views.${v}`)}
              </Link>
            </Button>
          ))}
        </nav>
        <nav aria-label={t("periodLabel")} className="flex items-center gap-1 sm:ml-auto">
          <Button asChild variant="ghost" size="sm">
            <Link href={href({ date: period.prev })} aria-label={t("previous")}>
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline-gold" size="sm">
            <Link href={href({ date: today })}>{t("today")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={href({ date: period.next })} aria-label={t("next")}>
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </nav>
      </div>
      <p className="mb-4 text-lg font-bold text-marine first-letter:uppercase" aria-live="polite">
        {periodLabel}
      </p>

      <SectionCard className="mb-6">
        <form
          method="get"
          action={`/${locale}/admin/court-calendar`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="view" value={filters.view} />
          {filters.date ? <input type="hidden" name="date" value={filters.date} /> : null}
          <div className="space-y-1">
            <label htmlFor="cc-office" className={labelClass}>
              {t("filters.office")}
            </label>
            <select id="cc-office" name="office" defaultValue={filters.office ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {pick(locale, o.name_fr, o.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="cc-lawyer" className={labelClass}>
              {t("filters.lawyer")}
            </label>
            <select id="cc-lawyer" name="lawyer" defaultValue={filters.lawyer ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {(staff ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {person(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="cc-court" className={labelClass}>
              {t("filters.court")}
            </label>
            <select id="cc-court" name="court" defaultValue={filters.court ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name_fr, c.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="cc-kind" className={labelClass}>
              {t("filters.kind")}
            </label>
            <select id="cc-kind" name="kind" defaultValue={filters.kind ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {courtDateKinds.map((k) => (
                <option key={k} value={k}>
                  {tCourt(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="cc-status" className={labelClass}>
              {t("filters.status")}
            </label>
            <select id="cc-status" name="status" defaultValue={filters.status} className={fieldClass}>
              <option value="active">{t("filters.active")}</option>
              <option value="to_confirm">{t("filters.toConfirm")}</option>
              <option value="all">{t("filters.allStatuses")}</option>
            </select>
          </div>
          <label htmlFor="cc-mine" className="flex min-h-10 items-center gap-2 self-end text-sm text-marine">
            <input
              id="cc-mine"
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={Boolean(filters.mine)}
              className="size-4 accent-marine"
            />
            {t("filters.mine")}
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="primary" size="sm">
              {t("filters.apply")}
            </Button>
            <span className="text-sm text-ink-muted" role="status">
              {t("count", { count: items.length })}
              {truncated ? ` — ${t("truncated")}` : ""}
            </span>
          </div>
        </form>
      </SectionCard>

      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-marine" aria-label={t("legend")}>
        {calendarDomains.map((d) => (
          <li key={d} className="inline-flex items-center gap-2">
            <span aria-hidden className={`inline-block size-4 rounded-[3px] ${DOMAIN_DOT[d]}`} />
            {t(`domains.${d}`)}
          </li>
        ))}
      </ul>
      <SectionCard>
        {items.length === 0 && filters.view === "list" ? (
          <EmptyState icon={Gavel} message={t("none")} />
        ) : filters.view === "list" ? (
          list
        ) : (
          <>
            {grid(daysOf(period.start, period.end))}
            <div className="md:hidden">
              {items.length ? list : <EmptyState icon={Gavel} message={t("none")} />}
            </div>
          </>
        )}
      </SectionCard>
      <div className="mt-4">
        <InfoNote>{t("help")}</InfoNote>
      </div>
    </>
  );
}
