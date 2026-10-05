import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shared/brand-mark";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";

/** Écran partagé de la maquette (design-system.md §5.1) : panneau marine + formulaire. */
export function AuthShell({ children, pathname }: { children: ReactNode; pathname: string }) {
  const t = useTranslations();
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between bg-marine p-12 text-white lg:flex">
        <BrandMark tone="light" priority />
        <div className="max-w-md">
          {/* Comme le grand titre de lexcanadalaw.com : 800, serré, mot mis en avant en italique 700 doré. */}
          <h2 className="font-display text-4xl leading-tight font-extrabold tracking-[-0.025em] text-white">
            {t("auth.panel.title")}{" "}
            <em className="font-bold text-gold-light italic">{t("auth.panel.titleAccent")}</em>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-white/70">{t("auth.panel.body")}</p>
        </div>
        <p className="text-xs text-white/60">{t("common.copyright", { year: new Date().getFullYear() })}</p>
      </aside>
      <main id="main" className="flex w-full flex-col bg-surface lg:w-1/2">
        <div className="flex justify-end p-6">
          <LocaleSwitcher pathname={pathname} />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-md">
            <BrandMark size="md" className="mx-auto mb-10 lg:hidden" priority />
            {children}
            <p className="mt-10 flex items-center justify-center gap-2 text-xs text-ink-muted">
              <ShieldCheck aria-hidden className="size-4 text-gold" />
              {t("auth.common.security")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
