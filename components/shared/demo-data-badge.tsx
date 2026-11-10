import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Signale des données fictives (AGENTS.md §2.7) : à afficher partout où des
 * données `is_mock = true` sont visibles.
 */
export function DemoDataBadge({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border border-gold/40 bg-cream px-2.5 py-1 text-xs font-medium text-gold-ink",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {t("demoData")}
    </span>
  );
}
