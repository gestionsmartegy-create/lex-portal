import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listRequestClients } from "@/server/services/document-requests";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";

/**
 * Onglet « Clients » des demandes de documents : les clients des dossiers ouverts de la personne,
 * leurs demandes en attente et en retard, et un bouton « Demander un document » par client.
 */
export async function RequestClients({ locale, q }: { locale: string; q: string }) {
  const [t, clients] = await Promise.all([
    getTranslations("admin.requests.clients"),
    listRequestClients(q.slice(0, 100)),
  ]);
  return (
    <SectionCard>
      <form method="get" action={`/${locale}/admin/requests`} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="rc-who" className="text-xs font-semibold tracking-[0.05em] text-marine uppercase">
            {t("search")}
          </label>
          <input id="rc-who" name="who" defaultValue={q} maxLength={100} className={fieldClass} />
        </div>
        <Button type="submit" variant="outline-marine" size="sm" className="h-10">
          {t("searchButton")}
        </Button>
      </form>
      {clients.length === 0 ? (
        <EmptyState icon={Users} message={q ? t("noMatch") : t("none")} />
      ) : (
        <ul className="divide-y divide-gray-100">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-semibold break-words text-marine">{c.name}</p>
                <p className="text-sm break-all text-ink-muted">{c.email}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {c.matters.map((m) => [m.number, m.title].filter(Boolean).join(" — ")).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.overdue ? <StatusBadge tone="urgent" label={t("overdue", { count: c.overdue })} /> : null}
                {c.pending ? <StatusBadge tone="pending" label={t("pending", { count: c.pending })} /> : null}
                {!c.overdue && !c.pending ? (
                  <span className="text-xs text-ink-muted">{t("nothing")}</span>
                ) : null}
                <Button asChild variant="primary" size="sm">
                  <Link
                    href={`/admin/requests/ask?client=${c.id}`}
                    aria-label={t("askFor", { name: c.name })}
                  >
                    {t("ask")}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
