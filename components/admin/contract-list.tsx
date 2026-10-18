import { FileSignature } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { ContractStatus } from "@/lib/contract-doc";

export const CONTRACT_TONE: Record<ContractStatus, StatusTone> = {
  draft: "pending",
  in_review: "active",
  validated: "active",
  sent: "active",
  signed: "completed",
  declined: "urgent",
  cancelled: "pending",
  superseded: "pending",
};

type Row = {
  id: string;
  title: string;
  status: ContractStatus;
  matterNumber: string | null;
  clientName: string;
  author: string | null;
  updatedAt: string;
  isMock: boolean;
};

/** Liste des contrats (F1) : une carte par contrat, lisible à 375 px (pas de tableau). */
export async function ContractList({ rows, locale }: { rows: Row[]; locale: string }) {
  const t = await getTranslations("admin.contracts");
  if (!rows.length) return <EmptyState icon={FileSignature} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href={`/admin/contracts/${r.id}`}
              className="font-semibold text-marine hover:underline focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              {r.title}
            </Link>
            <p className="text-sm text-ink-muted">
              {r.clientName}
              {r.matterNumber ? ` · ${r.matterNumber}` : ` · ${t("noMatter")}`}
              {r.author ? ` · ${r.author}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {r.isMock ? <DemoDataBadge /> : null}
            <StatusBadge tone={CONTRACT_TONE[r.status]} label={t(`status.${r.status}`)} />
            <span className="text-xs text-ink-muted">
              {t("updated", { date: formatDate(r.updatedAt, locale) })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
