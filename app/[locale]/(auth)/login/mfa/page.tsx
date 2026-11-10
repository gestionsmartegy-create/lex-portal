import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaForm } from "@/components/auth/mfa-form";
import { Link } from "@/i18n/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { verifyMfaAction } from "@/server/actions/auth";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

export default async function MfaPage({ params, searchParams }: PageProps<"/[locale]/login/mfa">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = typeof sp.next === "string" && safeNextPath(sp.next, locale, "") ? sp.next : undefined;

  const user = await getUser();
  if (!user) redirect(`/${locale}/login`);
  if ((await getSessionRole()) === "client") redirect(safeNextPath(next, locale));

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");

  let enrollment: { factorId: string; qrCode: string; secret: string } | undefined;
  if (!verified) {
    // Premier passage : on supprime les facteurs non vérifiés, puis on en crée un nouveau.
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Lex Canada Law" });
    if (!data) redirect(`/${locale}/login?error=link`);
    enrollment = { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }

  const t = await getTranslations("auth.mfa");
  return (
    <AuthShell pathname="/login/mfa">
      <h1 className="text-[28px] font-semibold">{enrollment ? t("enrollTitle") : t("verifyTitle")}</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">
        {enrollment ? t("enrollSubtitle") : t("verifySubtitle")}
      </p>
      <MfaForm action={verifyMfaAction} locale={locale} next={next} enrollment={enrollment} />
      {!enrollment ? (
        <p className="mt-6 text-center text-sm">
          <Link
            href="/login/mfa/lost"
            className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
          >
            {t("lostLink")}
          </Link>
        </p>
      ) : null}
    </AuthShell>
  );
}
