import { ShieldAlert } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Link } from "@/i18n/navigation";

// Perte du téléphone (ADR 0012) : AUCUNE réinitialisation en libre-service, seulement la marche à suivre.
export default async function MfaLostPage({ params }: PageProps<"/[locale]/login/mfa/lost">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.mfaLost");
  return (
    <AuthShell pathname="/login/mfa/lost">
      <h1 className="text-[28px] font-bold">{t("title")}</h1>
      <p className="mt-2 mb-6 text-sm text-ink-muted">{t("intro")}</p>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-marine">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <p className="mt-6 flex items-start gap-2 rounded-[2px] border border-gold/40 bg-cream p-4 text-sm text-marine">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-ink" />
        <span>{t("never")}</span>
      </p>
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="inline-flex min-h-6 items-center text-gold-ink hover:underline">
          {t("back")}
        </Link>
      </p>
    </AuthShell>
  );
}
