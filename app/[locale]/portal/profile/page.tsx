import { KeyRound, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoutButtons } from "@/components/auth/logout-buttons";
import { ProfileForm } from "@/components/portal/profile-form";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/server/actions/auth";
import { updateProfileAction } from "@/server/actions/portal";
import { requireClientSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getNotificationPreferences } from "@/server/services/notification";

export default async function ProfilePage({ params }: PageProps<"/[locale]/portal/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireClientSession(locale, `/${locale}/portal/profile`);
  const supabase = await createSupabaseServerClient();
  const [t, { data: profile }, prefs] = await Promise.all([
    getTranslations("portal.profile"),
    supabase
      .from("profiles")
      .select("first_name, last_name, email, phone, preferred_language")
      .eq("id", user.id)
      .single(),
    getNotificationPreferences(),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title={t("identity")} className="lg:col-span-3">
          {profile ? (
            <ProfileForm
              action={updateProfileAction}
              locale={locale}
              profile={profile}
              emailEnabled={prefs?.email_enabled ?? true}
            />
          ) : null}
        </SectionCard>
        <SectionCard title={t("security")} className="lg:col-span-2">
          <p className="mb-5 flex items-start gap-2 text-sm text-marine">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success-ink" />
            {t("mfaOn")}
          </p>
          <Button asChild variant="outline-gold" size="brand" className="mb-5 w-full">
            <Link href="/reset-password">
              <KeyRound aria-hidden className="size-4" /> {t("changePassword")}
            </Link>
          </Button>
          <LogoutButtons action={logoutAction} locale={locale} />
        </SectionCard>
      </div>
    </>
  );
}
