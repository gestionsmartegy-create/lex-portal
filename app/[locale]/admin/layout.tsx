import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMenu } from "@/components/portal/header-menus";
import { PortalMobileMenu, PortalSidebar } from "@/components/portal/sidebar-nav";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { SessionTimeoutGuard } from "@/components/shared/session-timeout-guard";
import { StyleNonce } from "@/components/shared/style-nonce";
import { initials } from "@/lib/format";
import { idleLogoutAction, keepSessionAliveAction, logoutAction } from "@/server/actions/auth";
import { requireStaff } from "@/server/auth/session";
import { StaffAlerts } from "@/components/admin/staff-alerts";
import { StaffSearch } from "@/components/admin/staff-search";
import { staffSearchAction } from "@/server/actions/staff-search";
import { getStaffAlerts } from "@/server/services/staff-search";

// Espace cabinet (J5) : garde du personnel (rôle EFFECTIF : session Microsoft, ou *.test en local),
// gabarit commun au portail, expiration après 30 min d'inactivité (ADR 0012).
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile, role } = await requireStaff(locale);
  const [t, tc] = await Promise.all([getTranslations("admin.nav"), getTranslations("common")]);
  const { alerts, unread } = await getStaffAlerts();
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const shellProps = {
    area: "admin" as const,
    isFirmAdmin: role === "firm_admin",
    counts: { messages: unread },
    user: {
      name,
      initials: initials(profile.first_name, profile.last_name, profile.email[0]?.toUpperCase()),
      subtitle: role === "firm_admin" ? t("roleAdmin") : t("roleStaff"),
    },
    locale,
    logout: logoutAction,
  };

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main"
        className="sr-only z-50 bg-white px-4 py-2 text-marine focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {tc("skipToContent")}
      </a>
      <PortalSidebar {...shellProps} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 sm:px-8">
          <PortalMobileMenu {...shellProps} />
          {/* Recherche globale (Ctrl K) et cloche : décision UX du 2026-10-18 (ADR 0033). */}
          <div className="flex min-w-0 flex-1">
            <StaffSearch locale={locale} search={staffSearchAction} />
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <StaffAlerts alerts={alerts} />
            <LocaleSwitcher />
            <AccountMenu
              initials={shellProps.user.initials}
              name={name}
              locale={locale}
              logout={logoutAction}
              profileHref={null}
            />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
      <StyleNonce />
      <SessionTimeoutGuard
        locale={locale}
        area="admin"
        keepAlive={keepSessionAliveAction}
        idleLogout={idleLogoutAction}
        logout={logoutAction}
      />
    </div>
  );
}
