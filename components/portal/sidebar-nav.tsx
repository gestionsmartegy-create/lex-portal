"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/shared/brand-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, PORTAL_NAV } from "./nav-items";

type Props = {
  /** Espace : les icônes restent côté client (non sérialisables depuis un Server Component). */
  area?: "portal" | "admin";
  /** Admin : afficher les entrées réservées au firm_admin. */
  isFirmAdmin?: boolean;
  counts: Partial<Record<string, number>>;
  user: { name: string; initials: string; subtitle: string | null };
  locale: string;
  logout: (formData: FormData) => Promise<void>;
};

function NavList({
  area = "portal",
  isFirmAdmin,
  counts,
  onNavigate,
}: Pick<Props, "area" | "isFirmAdmin" | "counts"> & { onNavigate?: () => void }) {
  const t = useTranslations(area === "admin" ? "admin.nav" : "portal.nav");
  const pathname = usePathname();
  const items =
    area === "admin"
      ? ADMIN_NAV.filter((i) => !("adminOnly" in i && i.adminOnly) || isFirmAdmin)
      : PORTAL_NAV;
  return (
    <ul className="space-y-1">
      {items.map(({ key, href, icon: Icon, ...rest }) => {
        const exact = "exact" in rest && rest.exact;
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        const count = counts[key] ?? 0;
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 border-l-2 px-4 text-sm transition-colors",
                active
                  ? "border-gold bg-white/10 font-medium text-white"
                  : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{t(key)}</span>
              {count > 0 ? (
                <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-marine">
                  {count}
                  <span className="sr-only"> — {t("countLabel", { count })}</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({
  area = "portal",
  isFirmAdmin,
  counts,
  user,
  locale,
  logout,
  onNavigate,
}: Props & { onNavigate?: () => void }) {
  const t = useTranslations("portal.nav");
  const ta = useTranslations("admin.nav");
  const tc = useTranslations("common");
  return (
    <div className="flex h-full flex-col bg-marine text-white">
      <div className="px-6 pt-7 pb-6">
        <BrandMark tone="light" size="sm" />
        <p className="mt-3 text-[9px] font-semibold tracking-[0.25em] text-white/60 uppercase">
          {area === "admin" ? ta("workspace") : tc("clientPortal")}
        </p>
      </div>
      <nav aria-label={t("label")} className="flex-1 overflow-y-auto py-2">
        <NavList area={area} isFirmAdmin={isFirmAdmin} counts={counts} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-marine"
          >
            {user.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            {user.subtitle ? <p className="truncate text-xs text-white/60">{user.subtitle}</p> : null}
          </div>
        </div>
        <form action={logout} className="mt-3">
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 px-1 text-sm text-white/75 transition-colors hover:text-[#FCA5A5]"
          >
            <LogOut aria-hidden className="size-4" />
            {t("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Barre latérale fixe (≥ lg) et tiroir mobile (< lg) — docs/design-system.md §5.2. */
export function PortalSidebar(props: Props) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
      <SidebarBody {...props} />
    </aside>
  );
}

export function PortalMobileMenu(props: Props) {
  const t = useTranslations("portal.nav");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-[2px] text-marine hover:bg-surface lg:hidden"
          aria-label={t("openMenu")}
        >
          <Menu aria-hidden className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-72 max-w-[85vw] border-0 p-0">
        <SheetTitle className="sr-only">{t("label")}</SheetTitle>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center text-white/80 hover:text-white"
          aria-label={t("closeMenu")}
        >
          <X aria-hidden className="size-5" />
        </button>
        <SidebarBody {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
