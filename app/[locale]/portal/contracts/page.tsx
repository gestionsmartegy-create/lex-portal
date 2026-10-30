import { FileSignature } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { clientContractState } from "@/lib/client-contract-state";
import { formatDate } from "@/lib/format";
import { requireClientSession } from "@/server/auth/session";
import { listMyContracts } from "@/server/services/client-contracts";

/** Mes contrats (ADR 0035) : seulement les contrats que le cabinet a envoyés, jamais un brouillon. */
export default async function ClientContractsPage({ params }: PageProps<"/[locale]/portal/contracts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/contracts`);
  const [t, rows] = await Promise.all([getTranslations("portal.contracts"), listMyContracts()]);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SectionCard>
        {rows.length === 0 ? (
          <EmptyState icon={FileSignature} message={t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((c) => {
              const state = clientContractState(c);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 basis-56">
                    <Link
                      href={`/portal/contracts/${c.id}`}
                      className="font-semibold text-marine hover:text-gold-ink hover:underline"
                    >
                      {c.title}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      {state === "accepted" && c.accepted_at
                        ? t("acceptedOn", { date: formatDate(c.accepted_at, locale) })
                        : t("sentOn", { date: formatDate(c.sent_at, locale) })}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      state === "accepted"
                        ? "completed"
                        : state === "toAccept"
                          ? "urgent"
                          : state === "declined"
                            ? "warning"
                            : "pending"
                    }
                    label={t(`states.${state}`)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
