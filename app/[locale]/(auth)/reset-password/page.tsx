import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/password-forms";
import { updatePasswordAction } from "@/server/actions/auth";
import { getUser } from "@/server/auth/session";

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Accessible uniquement avec la session ouverte par le lien de récupération.
  if (!(await getUser())) redirect(`/${locale}/login?error=link`);
  const t = await getTranslations("auth.reset");
  return (
    <AuthShell pathname="/reset-password">
      <h1 className="mb-8 text-[28px] font-semibold">{t("title")}</h1>
      <NewPasswordForm action={updatePasswordAction} locale={locale} submitLabel={t("submit")} />
    </AuthShell>
  );
}
