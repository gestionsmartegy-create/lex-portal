import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StatusTone = "active" | "pending" | "completed" | "urgent";

// Couleurs de la maquette (docs/design-system.md §1, « Statuts »).
const toneClasses: Record<StatusTone, string> = {
  active: "bg-status-active/15 text-gold-ink",
  pending: "bg-status-pending/10 text-[#1D4ED8]",
  completed: "bg-status-completed/10 text-[#166534]",
  urgent: "bg-status-urgent/10 text-[#B91C1C]",
};

type StatusBadgeProps = {
  tone: StatusTone;
  /** Libellé déjà traduit ; à défaut, libellé générique du ton. */
  label?: string;
  className?: string;
};

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  const t = useTranslations("status");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase",
        toneClasses[tone],
        className,
      )}
    >
      {label ?? t(tone)}
    </span>
  );
}
