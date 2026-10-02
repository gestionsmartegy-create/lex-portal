import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Polices de la maquette, HÉBERGÉES DANS LE PROJET (app/fonts, licence SIL OFL 1.1) :
// aucun appel à Google ni au build ni à l'exécution (ADR 0009). Polices variables, sous-ensemble latin.
const display = localFont({
  src: [
    { path: "../fonts/playfair-display-latin.woff2", weight: "400 900", style: "normal" },
    { path: "../fonts/playfair-display-italic-latin.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-display-family",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
const body = localFont({
  src: [
    { path: "../fonts/dm-sans-latin.woff2", weight: "100 1000", style: "normal" },
    { path: "../fonts/dm-sans-italic-latin.woff2", weight: "100 1000", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
const accent = localFont({
  src: [
    { path: "../fonts/cormorant-garamond-latin.woff2", weight: "300 700", style: "normal" },
    { path: "../fonts/cormorant-garamond-italic-latin.woff2", weight: "300 700", style: "italic" },
  ],
  variable: "--font-accent-family",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false }, // portail privé : jamais indexé
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Rendu dynamique obligatoire : le nonce CSP est généré à chaque requête (proxy.ts).
  await connection();

  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${accent.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
