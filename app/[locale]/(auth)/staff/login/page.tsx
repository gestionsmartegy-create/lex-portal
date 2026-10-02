import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormAlert } from "@/components/auth/form-parts";
import { StaffDemoLoginForm } from "@/components/auth/staff-login";
import { TIMEOUT_REASON } from "@/lib/session-timeout";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { staffDemoLoginAction, staffMicrosoftAction } from "@/server/actions/auth";

export default async function StaffLoginPage({ params, searchParams }: PageProps<"/[locale]/staff/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("auth.staff");
  const tSession = await getTranslations("auth.session");
  const ssoEnabled = process.env.NEXT_PUBLIC_STAFF_SSO_ENABLED === "true";
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AuthShell pathname="/staff/login">
      <h1 className="text-[28px] font-bold">{t("title")}</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">{t("subtitle")}</p>
      {sp.reason === TIMEOUT_REASON ? (
        <div className="mb-6">
          <FormAlert message={tSession("timedOut")} tone="info" />
        </div>
      ) : null}
      <form action={staffMicrosoftAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="primary" size="brand" className="w-full" disabled={!ssoEnabled}>
          {t("microsoft")}
        </Button>
      </form>
      {!ssoEnabled ? <p className="mt-3 text-xs text-ink-muted">{t("ssoPending")}</p> : null}
      {isDev ? (
        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="font-display text-lg font-semibold">{t("demoTitle")}</h2>
          <p className="mt-1 mb-5 text-xs text-ink-muted">{t("demoHint")}</p>
          <StaffDemoLoginForm action={staffDemoLoginAction} locale={locale} />
        </section>
      ) : null}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="inline-flex min-h-6 items-center text-gold-ink hover:underline">
          {t("clientLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
