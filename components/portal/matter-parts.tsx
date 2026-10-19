import { ChevronRight, FolderOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import type { MatterStatus } from "@/types/domain";
import { ProgressBar } from "./ui";

const MATTER_TONE: Record<MatterStatus, StatusTone> = {
  open: "active",
  action_required: "urgent",
  on_hold: "pending",
  closed: "completed",
};

export function MatterStatusBadge({ status }: { status: MatterStatus }) {
  const t = useTranslations("portal.matterStatus");
  return <StatusBadge tone={MATTER_TONE[status]} label={t(status)} />;
}

export type MatterRowData = {
  id: string;
  display_number: string | null;
  title: string;
  practice_area: string | null;
  status: MatterStatus;
  progress_percent: number | null;
  responsible_name: string | null;
  updated_at: string;
};

/** Ligne / carte de dossier (maquette « Recent Matters » et « My Matters »). */
export function MatterRow({ matter, actionRequired }: { matter: MatterRowData; actionRequired?: boolean }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const meta = [matter.display_number, matter.practice_area, matter.responsible_name]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/portal/matters/${matter.id}`}
      className="group flex items-center gap-4 rounded-[4px] border border-gray-100 bg-white p-4 transition-shadow duration-300 hover:shadow-md sm:p-5"
    >
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-[4px] bg-marine/5 text-marine sm:flex">
        <FolderOpen aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-marine">{matter.title}</span>
          {actionRequired ? <StatusBadge tone="urgent" label={t("matterStatus.action_required")} /> : null}
          <MatterStatusBadge status={matter.status} />
        </span>
        <span className="block text-xs text-ink-muted">
          {meta}
          {meta ? " · " : ""}
          {t("common.updated", { time: formatRelative(matter.updated_at, locale) })}
        </span>
        {matter.progress_percent !== null ? (
          <ProgressBar value={matter.progress_percent} label={t("common.progress")} />
        ) : null}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted group-hover:text-marine" />
    </Link>
  );
}

/** Indicateur de fraîcheur (`last_synced_at`, docs/design-system.md §5.4). */
export function Freshness({ at }: { at: string | null }) {
  const t = useTranslations("portal.common");
  const locale = useLocale();
  // Jamais de vocabulaire technique pour le client (ADR 0033) : rien si la date est inconnue.
  if (!at) return null;
  return <p className="text-xs text-ink-muted">{t("freshness", { time: formatRelative(at, locale) })}</p>;
}
