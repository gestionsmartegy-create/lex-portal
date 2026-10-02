import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Onglets en liens (rendu serveur, accessibles au clavier, partageables par URL). */
export function TabLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean; count?: number }[];
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                item.active
                  ? "border-gold font-medium text-marine"
                  : "border-transparent text-ink-muted hover:text-marine",
              )}
            >
              {item.label}
              {item.count ? (
                <span className="rounded-full bg-surface px-1.5 text-[11px] font-semibold text-marine">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
