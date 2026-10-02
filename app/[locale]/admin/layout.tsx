import { setRequestLocale } from "next-intl/server";
import { SessionTimeoutGuard } from "@/components/shared/session-timeout-guard";
import { idleLogoutAction, keepSessionAliveAction, logoutAction } from "@/server/actions/auth";
import { requireStaff } from "@/server/auth/session";

// Garde du personnel pour tout /admin : rôle EFFECTIF (session Microsoft, ou *.test en local).
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  return (
    <>
      {children}
      {/* Expiration après 30 min d'inactivité, comme pour les clients (ADR 0012). */}
      <SessionTimeoutGuard
        locale={locale}
        area="admin"
        keepAlive={keepSessionAliveAction}
        idleLogout={idleLogoutAction}
        logout={logoutAction}
      />
    </>
  );
}
