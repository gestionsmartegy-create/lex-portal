"use client";

import { Bell, LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

export type HeaderNotification = { id: string; title: string; age: string; unread: boolean };

export function NotificationsMenu({ items, unread }: { items: HeaderNotification[]; unread: number }) {
  const t = useTranslations("portal.header");
  return (
    <DropdownMenu>
      {/* Pastille hors du bouton : le nombre est déjà dans le nom accessible (règle axe label-content-name-mismatch). */}
      <span className="relative flex">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-[2px] text-marine hover:bg-surface"
            aria-label={unread > 0 ? `${t("notifications")} (${unread})` : t("notifications")}
          >
            <Bell aria-hidden className="size-5" />
          </button>
        </DropdownMenuTrigger>
        {unread > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-status-urgent text-[10px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </span>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-ink-muted">{t("noNotifications")}</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <Link href="/portal/notifications" className="flex flex-col items-start gap-0.5 py-2">
                <span className="flex w-full items-center gap-2 text-sm font-medium text-marine">
                  {n.unread ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" /> : null}
                  <span className="truncate">{n.title}</span>
                </span>
                <span className="text-xs text-ink-muted">{n.age}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/portal/notifications" className="text-sm font-medium text-gold-ink">
            {t("seeAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountMenu({
  initials,
  name,
  locale,
  logout,
  profileHref = "/portal/profile",
}: {
  initials: string;
  name: string;
  locale: string;
  logout: (formData: FormData) => Promise<void>;
  /** null : pas de lien profil (espace cabinet — profil géré dans Microsoft 365). */
  profileHref?: string | null;
}) {
  const t = useTranslations("portal.header");
  const tn = useTranslations("portal.nav");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Le nom accessible contient le texte visible, les initiales (règle axe label-content-name-mismatch).
          aria-label={`${t("account")} ${initials}`}
          className="flex size-11 items-center justify-center rounded-full"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-marine text-xs font-bold text-white">
            {initials}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profileHref ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={profileHref}>
                <UserRound aria-hidden /> {t("profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <form action={logout}>
          <input type="hidden" name="locale" value={locale} />
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden /> {tn("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
