import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoutButtons } from "@/components/auth/logout-buttons";
import { BrandMark } from "@/components/shared/brand-mark";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/server/actions/auth";
import { requireStaff } from "@/server/auth/session";

// Page minimale J3 : prouve la garde du personnel. Espace complet en J5.
export default async function AdminHome({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const t = await getTranslations("admin");

  return (
    <main id="main" className="min-h-screen bg-surface">
      <header className="flex items-center bg-marine px-6 py-4 sm:px-8">
        <BrandMark tone="light" size="sm" priority />
      </header>
      <section className="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">
        <h1 className="text-[28px] font-bold">{t("temp.title")}</h1>
        <p className="text-ink-muted">{t("temp.role", { role })}</p>
        <p className="text-sm text-ink-muted">{t("temp.comingSoon")}</p>
        {role === "firm_admin" ? (
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/admin/invitations" className="text-gold-ink hover:underline">
                {t("temp.invitations")} →
              </Link>
            </li>
            <li>
              <Link href="/admin/staff" className="text-gold-ink hover:underline">
                {t("temp.staff")} →
              </Link>
            </li>
          </ul>
        ) : null}
        <LogoutButtons action={logoutAction} locale={locale} />
      </section>
    </main>
  );
}
