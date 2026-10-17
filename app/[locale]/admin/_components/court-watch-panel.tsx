import { AlertTriangle, Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SectionCard } from "@/components/portal/ui";
import { Link } from "@/i18n/navigation";
import { formatZoned } from "@/lib/zoned-time";
import type { CalendarItem } from "@/server/services/court-calendar";

/**
 * Accueil de l'espace cabinet (ADR 0026) : audiences des 14 prochains jours, dates à confirmer et
 * conflits d'horaire. Données lues sous RLS (dossiers de ses équipes, tout le cabinet pour le firm_admin).
 */
export async function CourtWatchPanel({
  data,
  locale,
}: {
  data: { upcoming: CalendarItem[]; toConfirm: CalendarItem[]; conflicts: CalendarItem[] };
  locale: string;
}) {
  const [t, tCourt] = await Promise.all([
    getTranslations("admin.courtCalendar"),
    getTranslations("admin.court"),
  ]);
  const line = (i: CalendarItem) => (
    <li key={i.id} className="py-2 text-sm">
      {i.onTeam ? (
        <Link
          href={`/admin/matters/${i.matterId}?tab=court`}
          className="font-medium text-marine hover:underline"
        >
          {tCourt(`kinds.${i.kind}`)} · {i.matterNumber || i.matterTitle || t("unnamedMatter")}
        </Link>
      ) : (
        <span className="font-medium text-marine">
          {tCourt(`kinds.${i.kind}`)} · {i.matterNumber || i.matterTitle || t("unnamedMatter")}
        </span>
      )}
      <p className="text-xs text-ink-muted">
        {formatZoned(i.startsAt, i.timezone, locale, i.allDay)}
        {i.status === "scheduled" ? ` · ${t("toConfirm")}` : ""}
        {!i.onTeam ? ` · ${t("otherTeam")}` : ""}
      </p>
    </li>
  );
  return (
    <SectionCard
      title={t("next14")}
      className="mb-8"
      action={
        <Link
          href="/admin/court-calendar"
          className="inline-flex min-h-6 items-center text-sm text-gold-ink hover:underline"
        >
          {t("open")}
        </Link>
      }
    >
      {data.upcoming.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("noneNext14")}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="cw-upcoming">
            <h3 id="cw-upcoming" className="mb-2 flex items-center gap-2 text-sm font-bold text-marine">
              <Gavel aria-hidden className="size-4" />
              {t("upcomingCount", { count: data.upcoming.length })}
            </h3>
            <ul className="divide-y divide-gray-100">{data.upcoming.slice(0, 8).map(line)}</ul>
          </section>
          {data.conflicts.length || data.toConfirm.length ? (
            <section aria-labelledby="cw-alerts">
              <h3 id="cw-alerts" className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
                <AlertTriangle aria-hidden className="size-4" />
                {t("alertsCount", { conflicts: data.conflicts.length, toConfirm: data.toConfirm.length })}
              </h3>
              <ul className="divide-y divide-gray-100">
                {[...data.conflicts, ...data.toConfirm.filter((i) => !i.conflict)].slice(0, 8).map(line)}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
