import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { AccountMenu, NotificationsMenu } from "@/components/portal/header-menus";
import { SearchForm } from "@/components/portal/search-form";
import { PortalMobileMenu, PortalSidebar } from "@/components/portal/sidebar-nav";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { SessionTimeoutGuard } from "@/components/shared/session-timeout-guard";
import { StyleNonce } from "@/components/shared/style-nonce";
import { Link } from "@/i18n/navigation";
import { formatRelative, initials } from "@/lib/format";
import { idleLogoutAction, keepSessionAliveAction, logoutAction } from "@/server/actions/auth";
import { requireClientSession } from "@/server/auth/session";
import { getDashboardCounts } from "@/server/services/dashboard";
import { listNotifications } from "@/server/services/notification";

// Gabarit du portail client (docs/design-system.md §5.2) : barre latérale, en-tête, tiroir mobile,
// expiration de session (ADR 0012). Chaque page revérifie la session ; la RLS revérifie derrière.
export default async function PortalLayout({ children, params }: LayoutProps<"/[locale]/portal">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireClientSession(locale, `/${locale}/portal`);
  const [counts, notifications, t, tNav, tSearch] = await Promise.all([
    getDashboardCounts(),
    listNotifications(5),
    getTranslations("common"),
    getTranslations("portal.nav"),
    getTranslations("portal.search"),
  ]);

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const user = {
    name,
    initials: initials(profile.first_name, profile.last_name, profile.email[0]?.toUpperCase()),
    subtitle: profile.client_number ? tNav("clientNumber", { number: profile.client_number }) : null,
  };
  const navCounts = {
    matters: counts.activeMatters,
    documents: counts.pendingDocuments,
    messages: counts.unreadMessages,
    billing: counts.dueInvoices,
    notifications: counts.unreadNotifications,
  };
  const shellProps = { counts: navCounts, user, locale, logout: logoutAction };

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main"
        className="sr-only z-50 bg-white px-4 py-2 text-marine focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <PortalSidebar {...shellProps} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 sm:px-8">
          <PortalMobileMenu {...shellProps} />
          {/* Recherche globale : champ dès 640 px, icône vers la page de recherche en dessous. */}
          <div className="flex min-w-0 flex-1 justify-end sm:justify-start">
            <SearchForm locale={locale} id="header-search" className="hidden w-full max-w-sm sm:block" />
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/portal/search"
              aria-label={tSearch("open")}
              className="flex size-11 items-center justify-center rounded-[2px] text-marine hover:bg-surface focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none sm:hidden"
            >
              <Search aria-hidden className="size-5" />
            </Link>
            <LocaleSwitcher />
            <NotificationsMenu
              unread={counts.unreadNotifications}
              items={notifications.map((n) => ({
                id: n.id,
                title: n.title,
                age: formatRelative(n.created_at, locale),
                unread: !n.read_at,
              }))}
            />
            <AccountMenu initials={user.initials} name={name} locale={locale} logout={logoutAction} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
      <StyleNonce />
      <SessionTimeoutGuard
        locale={locale}
        area="portal"
        keepAlive={keepSessionAliveAction}
        idleLogout={idleLogoutAction}
        logout={logoutAction}
      />
    </div>
  );
}
