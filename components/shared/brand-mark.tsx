import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import logoDark from "@/public/brand/logo-mark-dark.png";
import logoWhite from "@/public/brand/logo-mark-white.png";

type BrandMarkProps = {
  /** "light" = logo blanc sur fond foncé ; "dark" = logo noir et or sur fond clair. */
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  /** À activer pour le logo visible au chargement (au-dessus de la ligne de flottaison). */
  priority?: boolean;
  className?: string;
};

// Logo officiel « LC » + feuille d'érable (fourni par le cabinet, identique à lexcanadalaw.com).
const heights = { sm: "h-9", md: "h-12", lg: "h-16" } as const;

export function BrandMark({ tone = "dark", size = "md", priority = false, className }: BrandMarkProps) {
  const t = useTranslations("common");
  return (
    <Image
      src={tone === "light" ? logoWhite : logoDark}
      alt={t("brand")}
      priority={priority}
      className={cn("w-auto", heights[size], className)}
    />
  );
}
