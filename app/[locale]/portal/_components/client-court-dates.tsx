import { Gavel, Video } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatZoned, formatZonedTime } from "@/lib/zoned-time";
import type { ClientCourtDate } from "@/server/services/client-court-dates";

/**
 * Dates de cour du client (ADR 0028) : seulement celles que l'avocat a rendues visibles.
 * Date et heure dans le fuseau du tribunal, lieu, lien d'audience virtuelle (https), consignes.
 */
export async function ClientCourtDates({ dates, locale }: { dates: ClientCourtDate[]; locale: string }) {
  const t = await getTranslations("portal.courtDates");
  if (dates.length === 0) return <EmptyState icon={Gavel} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {dates.map((d) => {
        const court =
          locale === "fr" ? (d.court_name_fr ?? d.court_name_en) : (d.court_name_en ?? d.court_name_fr);
        return (
          <li key={d.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-marine">
                {t(`kinds.${d.kind}`)} · {formatZoned(d.starts_at, d.timezone, locale, d.all_day)}
                {d.ends_at && !d.all_day ? ` – ${formatZonedTime(d.ends_at, d.timezone, locale)}` : ""}
              </p>
              <StatusBadge
                tone={d.status === "confirmed" ? "completed" : "pending"}
                label={d.status === "confirmed" ? t("confirmed") : t("toConfirm")}
              />
            </div>
            <p className="text-sm break-words text-ink-muted">
              {[
                d.display_number ? t("matter", { number: d.display_number }) : null,
                court,
                d.room ? t("room", { room: d.room }) : null,
                d.court_address,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {d.virtual_link ? (
              <a
                href={d.virtual_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-gold-ink hover:underline"
              >
                <Video aria-hidden className="size-4" />
                {t("join")}
              </a>
            ) : null}
            {d.client_instructions ? (
              <div className="rounded-[2px] border border-gold/40 bg-cream p-3 text-sm text-marine">
                <p className="mb-1 text-xs font-semibold tracking-[0.05em] uppercase">{t("instructions")}</p>
                <p className="whitespace-pre-line">{d.client_instructions}</p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
