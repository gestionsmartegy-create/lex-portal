"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/shared/brand-mark";
import { Link } from "@/i18n/navigation";

/**
 * Erreur inattendue d'une page (ADR 0011) : jamais le message technique (AGENTS.md §5),
 * seulement l'empreinte `digest` que Next.js relie au log serveur.
 */
export default function ErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors.unexpected");
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center"
    >
      <BrandMark size="lg" className="mb-10 self-center" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-md text-sm text-ink-muted">{t("body")}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-ink-muted">{t("reference", { digest: error.digest })}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {/* Rechargement complet : récupère aussi la dernière version déployée (un onglet ouvert
            avant un déploiement envoie des actions que le serveur ne connaît plus). */}
        <Button variant="primary" size="brand" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
        <Button asChild variant="outline-gold" size="brand">
          <Link href="/">{t("back")}</Link>
        </Button>
      </div>
    </main>
  );
}
