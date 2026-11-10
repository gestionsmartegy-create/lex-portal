import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Bascule FR/EN en conservant la page courante. Composant serveur : le chemin
 * est relu côté client par next-intl lors de la navigation.
 */
export function LocaleSwitcher({
  tone = "dark",
  pathname = "/",
}: {
  tone?: "light" | "dark";
  pathname?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const target = locale === "en" ? "fr" : "en";
  return (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      aria-label={`${t("language")} : ${t("switchTo")}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline",
        tone === "light" ? "text-white/80 hover:text-white" : "text-ink-muted hover:text-marine",
      )}
    >
      <Globe aria-hidden className="size-3.5" />
      {t("switchTo")}
    </Link>
  );
}
