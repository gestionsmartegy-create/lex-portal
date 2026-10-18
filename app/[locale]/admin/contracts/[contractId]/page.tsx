import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CONTRACT_TONE } from "@/components/admin/contract-list";
import { ContractWorkspace } from "@/components/admin/contract-editor/workspace";
import { PageHeader } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import {
  acquireLockAction,
  aiAssistAction,
  releaseLockAction,
  saveSectionAction,
  sectionOpAction,
  statusAction,
  updateHeaderAction,
  versionAction,
} from "@/server/actions/contracts";
import { requireStaff } from "@/server/auth/session";
import { getContract } from "@/server/services/contracts";

/** Rédaction d'un contrat (F3). Invisible ou inexistant : même 404 (AGENTS.md §2.9). */
export default async function ContractPage({ params }: PageProps<"/[locale]/admin/contracts/[contractId]">) {
  const { locale, contractId } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const loaded = await getContract(contractId);
  if (!loaded) notFound();
  const t = await getTranslations("admin.contracts");
  const { contract } = loaded;
  const labels = Object.fromEntries(
    contractFieldKeys.map((k) => [k, t(`fieldKeys.${k.replace(".", "_")}`)]),
  ) as Record<ContractFieldKey, string>;
  const display = Object.fromEntries(
    contractFieldKeys.map((k) => [k, { label: labels[k], value: loaded.values[k] }]),
  ) as Record<ContractFieldKey, { label: string; value: string | null }>;

  return (
    <>
      <Link href="/admin/contracts" className="mb-4 inline-flex text-sm text-gold-ink hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={contract.title}
        subtitle={[
          contract.clientName,
          contract.matter ? (contract.matter.number ?? contract.matter.title) : t("noMatter"),
          contract.author,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {contract.isMock ? <DemoDataBadge /> : null}
            <StatusBadge tone={CONTRACT_TONE[contract.status]} label={t(`status.${contract.status}`)} />
          </>
        }
      />
      {contract.matter ? (
        <p className="-mt-6 mb-6 text-sm">
          <Link
            href={`/admin/matters/${contract.matter.id}?tab=contracts`}
            className="text-gold-ink hover:underline"
          >
            {t("openMatter")}
          </Link>
        </p>
      ) : null}
      {contract.status === "cancelled" && contract.cancelReason ? (
        <p className="mb-6 rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine">
          {t("cancelledBecause", { reason: contract.cancelReason })}
        </p>
      ) : null}
      <ContractWorkspace
        locale={locale}
        contract={{
          id: contract.id,
          title: contract.title,
          language: contract.language,
          status: contract.status,
          editable: contract.editable,
          clientName: contract.clientName,
          clientEmail: contract.clientEmail,
          clientAddress: contract.clientAddress,
          clientPhone: contract.clientPhone,
          clientLanguage: contract.clientLanguage,
        }}
        sections={loaded.sections}
        versions={loaded.versions}
        display={display}
        missingLabels={loaded.missing.map((k) => labels[k])}
        actions={{
          acquireLock: acquireLockAction,
          releaseLock: releaseLockAction,
          saveSection: saveSectionAction,
          updateHeader: updateHeaderAction,
          sectionOp: sectionOpAction,
          version: versionAction,
          status: statusAction,
          ai: aiAssistAction,
        }}
      />
    </>
  );
}
