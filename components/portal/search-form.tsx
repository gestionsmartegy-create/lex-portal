import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Formulaire de recherche globale (GET vers /portal/search, sans JavaScript).
 * Composant serveur : la requête est validée et exécutée côté serveur, avec la RLS.
 */
export function SearchForm({
  locale,
  defaultValue,
  id,
  className,
}: {
  locale: string;
  defaultValue?: string;
  id: string;
  className?: string;
}) {
  const t = useTranslations("portal.search");
  return (
    <form
      role="search"
      method="get"
      action={`/${locale}/portal/search`}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("label")}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t("placeholder")}
        maxLength={100}
        autoComplete="off"
        className="h-11 w-full rounded-[2px] border border-gray-200 bg-white pr-3 pl-9 text-sm text-marine placeholder:text-ink-muted focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
      />
    </form>
  );
}
