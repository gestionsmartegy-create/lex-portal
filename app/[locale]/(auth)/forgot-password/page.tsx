import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Link } from "@/i18n/navigation";
import { forgotPasswordAction } from "@/server/actions/auth";

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <AuthShell pathname="/forgot-password">
      <h1 className="text-[28px] font-semibold">{t("forgot.title")}</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">{t("forgot.subtitle")}</p>
      <ForgotPasswordForm action={forgotPasswordAction} locale={locale} />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="inline-flex min-h-6 items-center text-gold-ink hover:underline">
          {t("common.backToLogin")}
        </Link>
      </p>
    </AuthShell>
  );
}
