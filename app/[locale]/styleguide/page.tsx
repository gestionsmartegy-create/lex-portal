import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { BrandMark } from "@/components/shared/brand-mark";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Valeurs affichées à titre de référence ; la source de vérité est app/globals.css.
const swatches = [
  { name: "marine", value: "#0D1B3E", className: "bg-marine" },
  { name: "marine-light", value: "#162347", className: "bg-marine-light" },
  { name: "gold", value: "#B8962E", className: "bg-gold" },
  { name: "gold-light", value: "#D4AF5A", className: "bg-gold-light" },
  { name: "gold-pale", value: "#F5E9C8", className: "bg-gold-pale" },
  { name: "gold-ink", value: "#7F6416", className: "bg-gold-ink" },
  { name: "cream", value: "#FDF8EE", className: "bg-cream" },
  { name: "surface", value: "#F4F5F7", className: "bg-surface" },
  { name: "surface-alt", value: "#F8F9FB", className: "bg-surface-alt" },
  { name: "ink-muted", value: "#4A4A5A", className: "bg-ink-muted" },
  { name: "ink-subtle", value: "#8A8A9A", className: "bg-ink-subtle" },
] as const;

/** Guide de style — développement uniquement (404 en production). */
export default function StyleguidePage({ params }: PageProps<"/[locale]/styleguide">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("styleguide");

  return (
    <main id="main" className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 sm:px-8">
        <BrandMark size="sm" priority />
        <LocaleSwitcher pathname="/styleguide" />
      </header>

      <div className="mx-auto max-w-5xl space-y-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold">{t("title")}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t("intro")}</p>
          </div>
          <DemoDataBadge />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold text-marine">{t("colors")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {swatches.map((s) => (
              <div key={s.name} className="overflow-hidden rounded-[4px] border border-gray-100">
                <div className={`h-16 ${s.className}`} />
                <div className="p-3 text-xs">
                  <div className="font-semibold text-marine">{s.name}</div>
                  <div className="font-mono text-ink-muted">{s.value}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold text-marine">{t("typography")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-display text-[28px] font-bold text-marine">{t("displaySample")}</p>
            <p className="text-sm text-ink-muted">{t("bodySample")}</p>
            <p className="font-accent text-2xl text-gold-ink italic">{t("accentSample")}</p>
            <p className="text-xs font-semibold tracking-[0.05em] text-marine uppercase">{t("emailLabel")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold text-marine">{t("buttons")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="brand">
              {t("primary")} <ArrowRight aria-hidden />
            </Button>
            <Button variant="outline-gold" size="brand">
              {t("outlineGold")}
            </Button>
            <div className="bg-marine p-4">
              <Button variant="ghost-white" size="brand">
                {t("ghostWhite")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold text-marine">{t("badges")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="active" />
            <StatusBadge tone="pending" />
            <StatusBadge tone="completed" />
            <StatusBadge tone="urgent" />
            <DemoDataBadge />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold text-marine">{t("fields")}</CardTitle>
          </CardHeader>
          <CardContent className="max-w-md space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="sg-email"
                className="text-xs font-semibold tracking-[0.05em] text-marine uppercase"
              >
                {t("emailLabel")}
              </Label>
              <a href="#" className="inline-flex min-h-6 items-center text-xs text-gold-ink hover:underline">
                {t("linkSample")}
              </a>
            </div>
            <Input
              id="sg-email"
              type="email"
              placeholder="your@email.com"
              className="h-11 rounded-[2px] border-gray-200 focus-visible:border-gold focus-visible:ring-gold/30"
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
