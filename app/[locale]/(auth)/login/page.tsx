import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Link } from "@/i18n/navigation";
import { publicEnv } from "@/lib/env.public";
import { safeNextPath } from "@/lib/safe-redirect";
import { TIMEOUT_REASON } from "@/lib/session-timeout";
import { loginAction } from "@/server/actions/auth";

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("auth");
  const rawNext = typeof sp.next === "string" ? sp.next : undefined;
  // On ne propage que des chemins internes validés.
  const next = rawNext && safeNextPath(rawNext, locale, "") ? rawNext : undefined;
  const notice =
    sp.signedOut === "all"
      ? t("login.signedOutAll")
      : sp.error === "link"
        ? t("login.linkError")
        : sp.reason === TIMEOUT_REASON
          ? t("session.timedOut")
          : undefined;

  return (
    <AuthShell pathname="/login">
      <h1 className="text-[28px] font-bold">{t("login.title")}</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">{t("login.subtitle")}</p>
      <LoginForm action={loginAction} locale={locale} next={next} notice={notice} />
      <div className="mt-8 space-y-3 text-center text-sm">
        <p className="text-ink-muted">{t("login.noAccount")}</p>
        <a
          href={publicEnv.NEXT_PUBLIC_CLIO_BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-6 items-center font-medium text-gold-ink hover:underline"
        >
          {t("login.book")} →
        </a>
        <p>
          <Link
            href="/staff/login"
            className="inline-flex min-h-6 items-center text-xs text-ink-muted underline-offset-4 hover:underline"
          >
            {t("login.staffLink")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
