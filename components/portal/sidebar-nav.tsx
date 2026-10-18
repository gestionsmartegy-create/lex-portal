"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/shared/brand-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_GROUPS, PORTAL_NAV } from "./nav-items";

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

type Variant = "rail" | "sheet";

const linkClass = (active: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 border-l-2 px-4 text-sm transition-colors",
    active
      ? "border-gold bg-white/10 font-medium text-white"
      : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
  );

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) => {
    const path = href.split("?")[0]!;
    return exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };
}

function CountPill({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-marine">
      {count}
      <span className="sr-only"> — {label}</span>
    </span>
  );
}

/** Menu déroulant d'une entrée : au survol et au clavier (focus), à droite de la barre. */
function Flyout({
  id,
  label,
  children,
  bottom = false,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  bottom?: boolean;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      className={cn(
        "absolute left-full z-50 hidden w-64 rounded-[8px] bg-white p-2 text-marine shadow-xl ring-1 ring-black/5 group-focus-within:block group-hover:block",
        bottom ? "bottom-0" : "top-0",
      )}
    >
      {children}
    </div>
  );
}

const flyLink =
  "block rounded-[6px] px-3 py-2 text-sm text-marine hover:bg-cream hover:text-gold-ink focus-visible:bg-cream focus-visible:text-gold-ink focus-visible:outline-none";
const flyPrimary =
  "mt-1 block rounded-[6px] bg-marine px-3 py-2 text-center text-sm font-semibold text-white hover:bg-marine-light focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none";

function AdminNav({
  isFirmAdmin,
  counts,
  onNavigate,
  variant,
}: Pick<Props, "isFirmAdmin" | "counts"> & { onNavigate?: () => void; variant: Variant }) {
  const t = useTranslations("admin.nav");
  const isActive = useIsActive();
  const groups = ADMIN_NAV_GROUPS.filter((g) => !("adminOnly" in g && g.adminOnly) || isFirmAdmin);
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        // Administration : une seule entrée ; son contenu dans un menu déroulant (barre) ou dépliable (tiroir).
        if ("collapsed" in group && group.collapsed) {
          const anyActive = group.items.some((i) => isActive(i.href));
          if (variant === "sheet")
            return (
              <details key={group.key} open={anyActive} className="text-white/75">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[11px] font-semibold tracking-[0.12em] uppercase hover:text-white">
                  {t(group.key)}
                </summary>
                <ul className="space-y-1">
                  {group.items.map(({ key, href, icon: Icon }) => (
                    <li key={key}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={isActive(href) ? "page" : undefined}
                        className={linkClass(isActive(href))}
                      >
                        <Icon aria-hidden className="size-4 shrink-0" />
                        <span className="flex-1">{t(key)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          return (
            <div key={group.key} className="group relative">
              <button
                type="button"
                aria-haspopup="true"
                aria-controls={`fly-${group.key}`}
                className={cn(linkClass(anyActive), "w-full justify-between text-left")}
              >
                <span className="text-[11px] font-semibold tracking-[0.12em] uppercase">{t(group.key)}</span>
                <span aria-hidden>›</span>
              </button>
              <Flyout id={`fly-${group.key}`} label={t("submenu", { name: t(group.key) })} bottom>
                {group.items.map(({ key, href }) => (
                  <Link
                    key={key}
                    href={href}
                    className={flyLink}
                    aria-current={isActive(href) ? "page" : undefined}
                  >
                    {t(key)}
                  </Link>
                ))}
              </Flyout>
            </div>
          );
        }
        return (
          <div key={group.key}>
            <p className="px-4 pb-1 text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">
              {t(group.key)}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const { key, href, icon: Icon } = item;
                const active = isActive(href, "exact" in item && item.exact);
                const children =
                  variant === "rail" && "children" in item
                    ? item.children.filter((c) => !("adminOnly" in c && c.adminOnly) || isFirmAdmin)
                    : [];
                const count = counts[key] ?? 0;
                return (
                  <li key={key} className={children.length ? "group relative" : undefined}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      aria-haspopup={children.length ? "true" : undefined}
                      className={linkClass(active)}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="flex-1">{t(key)}</span>
                      <CountPill count={count} label={t("countLabel", { count })} />
                      {children.length ? (
                        <span aria-hidden className="text-white/50">
                          ›
                        </span>
                      ) : null}
                    </Link>
                    {children.length ? (
                      <Flyout id={`fly-${key}`} label={t("submenu", { name: t(key) })}>
                        {children.map((c) => (
                          <Link
                            key={c.key}
                            href={c.href}
                            className={"primary" in c && c.primary ? flyPrimary : flyLink}
                          >
                            {t(c.key)}
                          </Link>
                        ))}
                      </Flyout>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function NavList({
  area = "portal",
  isFirmAdmin,
  counts,
  onNavigate,
  variant = "rail",
}: Pick<Props, "area" | "isFirmAdmin" | "counts"> & { onNavigate?: () => void; variant?: Variant }) {
  const t = useTranslations("portal.nav");
  const isActive = useIsActive();
  if (area === "admin")
    return <AdminNav isFirmAdmin={isFirmAdmin} counts={counts} onNavigate={onNavigate} variant={variant} />;
  return (
    <ul className="space-y-1">
      {PORTAL_NAV.map(({ key, href, icon: Icon, ...rest }) => {
        const active = isActive(href, "exact" in rest && rest.exact);
        const count = counts[key] ?? 0;
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{t(key)}</span>
              <CountPill count={count} label={t("countLabel", { count })} />
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
  variant = "rail",
}: Props & { onNavigate?: () => void; variant?: Variant }) {
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
      <nav
        aria-label={area === "admin" ? ta("label") : t("label")}
        className={cn(
          "flex-1 py-2",
          variant === "sheet" || area !== "admin" ? "overflow-y-auto" : "overflow-visible",
        )}
      >
        <NavList
          area={area}
          isFirmAdmin={isFirmAdmin}
          counts={counts}
          onNavigate={onNavigate}
          variant={variant}
        />
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
        <SidebarBody {...props} onNavigate={() => setOpen(false)} variant="sheet" />
      </SheetContent>
    </Sheet>
  );
}
