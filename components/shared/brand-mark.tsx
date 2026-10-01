import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type BrandMarkProps = { tone?: "light" | "dark"; className?: string };

/** Monogramme « LC ✦ » + nom du cabinet, comme dans la maquette. */
export function BrandMark({ tone = "dark", className }: BrandMarkProps) {
  const t = useTranslations("common");
  const color = tone === "light" ? "text-white" : "text-marine";
  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span className={cn("font-display text-xl font-bold", color)}>
        {t("brandMonogram")}{" "}
        <span className="text-gold" aria-hidden>
          ✦
        </span>
      </span>
      <span className={cn("mt-1 font-display text-[11px] font-semibold tracking-[0.18em] uppercase", color)}>
        {t("brand")}
      </span>
    </div>
  );
}
