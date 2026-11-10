import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/password-forms";
import { Link } from "@/i18n/navigation";
import { acceptInvitationAction } from "@/server/actions/auth";
import { findValidInvitation } from "@/server/services/invitation";

export const metadata = { referrer: "no-referrer" as const }; // le jeton ne fuit jamais par l'en-tête Referer

export default async function InvitationPage({ params }: PageProps<"/[locale]/invite/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const invitation = await findValidInvitation(token);

  return (
    <AuthShell pathname={`/invite/${token}`}>
      {invitation ? (
        <>
          <h1 className="text-[28px] font-semibold">{t("invite.title")}</h1>
          <p className="mt-2 mb-8 text-sm text-ink-muted">
            {t("invite.subtitle", { name: invitation.first_name ? `, ${invitation.first_name}` : "" })}
          </p>
          <NewPasswordForm
            action={acceptInvitationAction}
            locale={locale}
            token={token}
            submitLabel={t("invite.submit")}
          />
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-semibold">{t("invite.invalidTitle")}</h1>
          <p className="mt-3 text-sm text-ink-muted">{t("invite.invalidBody")}</p>
          <p className="mt-8 text-sm">
            <Link href="/login" className="inline-flex min-h-6 items-center text-gold-ink hover:underline">
              {t("common.backToLogin")}
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
