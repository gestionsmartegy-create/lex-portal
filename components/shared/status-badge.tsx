import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StatusTone = "active" | "pending" | "completed" | "urgent" | "warning";

// Couleurs de la maquette (docs/design-system.md §1, « Statuts »).
const toneClasses: Record<StatusTone, string> = {
  active: "bg-status-active/15 text-gold-ink",
  pending: "bg-status-pending/10 text-info-ink",
  completed: "bg-status-completed/10 text-success-ink-deep",
  urgent: "bg-status-urgent/10 text-danger-ink",
  // À confirmer : ambre (vert = confirmé, rouge = conflit ou retard).
  warning: "bg-status-warning/20 text-warning-ink",
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
        "inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {label ?? t(tone)}
    </span>
  );
}
