import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/shared/brand-mark";
import { Link } from "@/i18n/navigation";

// Même page pour « n'existe pas » et « pas autorisé » (AGENTS.md §2.9).
export default function NotFound() {
  const t = useTranslations("errors.notFound");
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center"
    >
      <BrandMark size="lg" className="mb-10 self-center" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-md text-sm text-ink-muted">{t("body")}</p>
      <Button asChild variant="primary" size="brand" className="mt-8">
        <Link href="/">{t("back")}</Link>
      </Button>
    </main>
  );
}
