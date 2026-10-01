import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/shared/brand-mark";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { publicEnv } from "@/lib/env.public";

// Accueil provisoire (J1). Remplacé en J3 par la redirection vers /[locale]/login.
export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <main id="main" className="flex min-h-screen flex-col bg-marine text-white">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <BrandMark tone="light" priority />
        <LocaleSwitcher tone="light" />
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
        <p className="mb-6 text-[11px] font-semibold tracking-[0.2em] text-gold-light uppercase">
          {t("home.eyebrow")}
        </p>
        <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl">
          {t("home.title")} <em className="font-display text-gold-light italic">{t("home.titleAccent")}</em>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75">{t("home.body")}</p>
        <p className="mt-8 border-l-2 border-gold pl-4 text-sm text-white/80">{t("home.status")}</p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          {publicEnv.NEXT_PUBLIC_CLIO_BOOKING_URL ? (
            <Button asChild variant="ghost-white" size="brand">
              <a href={publicEnv.NEXT_PUBLIC_CLIO_BOOKING_URL} target="_blank" rel="noopener noreferrer">
                {t("home.ctaBooking")}
                <ArrowRight aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-white/10 px-6 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-4 text-gold" />
          {t("home.security")}
        </span>
        <span>{t("common.copyright", { year: new Date().getFullYear() })}</span>
      </footer>
    </main>
  );
}
