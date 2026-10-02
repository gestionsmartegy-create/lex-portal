import { LogOut, MonitorX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Déconnexion (cet appareil / tous les appareils). L'action serveur est passée par la page. */
export function LogoutButtons({
  action,
  locale,
}: {
  action: (formData: FormData) => Promise<void>;
  locale: string;
}) {
  const t = useTranslations("auth.logout");
  return (
    <div className="flex flex-wrap gap-3">
      <form action={action}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline-gold" size="brand">
          <LogOut aria-hidden /> {t("signOut")}
        </Button>
      </form>
      <form action={action}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="scope" value="global" />
        <Button type="submit" variant="ghost" size="brand" className="text-ink-muted">
          <MonitorX aria-hidden /> {t("signOutAll")}
        </Button>
      </form>
    </div>
  );
}
