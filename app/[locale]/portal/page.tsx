import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoutButtons } from "@/components/auth/logout-buttons";
import { BrandMark } from "@/components/shared/brand-mark";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { logoutAction } from "@/server/actions/auth";
import { requireClientSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

// Page minimale J3 : prouve la garde client (MFA) et la RLS. Tableau de bord complet en J5.
export default async function PortalPage({ params }: PageProps<"/[locale]/portal">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireClientSession(locale, `/${locale}/portal`);

  // Lecture AVEC la session : la RLS ne renvoie que les dossiers autorisés.
  const supabase = await createSupabaseServerClient();
  const { data: matters } = await supabase.from("matters").select("id, is_mock");
  const t = await getTranslations("portal.temp");

  return (
    <main id="main" className="min-h-screen bg-surface">
      <header className="flex items-center justify-between bg-marine px-6 py-4 sm:px-8">
        <BrandMark tone="light" size="sm" priority />
        {matters?.some((m) => m.is_mock) ? <DemoDataBadge /> : null}
      </header>
      <section className="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">
        <h1 className="text-[28px] font-bold">
          {profile.first_name ? t("greeting", { name: profile.first_name }) : t("greetingNoName")}
        </h1>
        <p className="text-ink-muted">{t("matters", { count: matters?.length ?? 0 })}</p>
        <p className="text-sm text-ink-muted">{t("comingSoon")}</p>
        <LogoutButtons action={logoutAction} locale={locale} />
      </section>
    </main>
  );
}
