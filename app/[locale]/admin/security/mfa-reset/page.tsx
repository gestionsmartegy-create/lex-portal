import { getTranslations, setRequestLocale } from "next-intl/server";
import { MfaResetForm } from "@/components/admin/mfa-reset-form";
import { resetClientMfaAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";

// Page minimale J3.2 (ADR 0012) ; elle rejoindra la fiche client de l'espace cabinet en J5.
export default async function MfaResetPage({ params }: PageProps<"/[locale]/admin/security/mfa-reset">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const t = await getTranslations("admin.mfaReset");
  return (
    <main id="main" className="mx-auto min-h-screen max-w-xl bg-surface p-6 sm:p-10">
      <h1 className="mb-8 text-[28px] font-bold">{t("title")}</h1>
      <MfaResetForm action={resetClientMfaAction} locale={locale} />
    </main>
  );
}
