import { setRequestLocale } from "next-intl/server";
import { SessionTimeoutGuard } from "@/components/shared/session-timeout-guard";
import { idleLogoutAction, keepSessionAliveAction, logoutAction } from "@/server/actions/auth";

// Gabarit minimal du portail (le gabarit complet arrive en J5) : expiration de session (ADR 0012).
// La garde d'accès reste dans chaque page (requireClientSession), revérifiée par la RLS.
export default async function PortalLayout({ children, params }: LayoutProps<"/[locale]/portal">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      {children}
      <SessionTimeoutGuard
        locale={locale}
        area="portal"
        keepAlive={keepSessionAliveAction}
        idleLogout={idleLogoutAction}
        logout={logoutAction}
      />
    </>
  );
}
