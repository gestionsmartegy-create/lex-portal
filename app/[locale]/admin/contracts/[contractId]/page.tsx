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
  commentAction,
  releaseLockAction,
  saveSectionAction,
  sectionOpAction,
  statusAction,
  updateHeaderAction,
  versionAction,
  workflowAction,
} from "@/server/actions/contracts";
import {
  publishTemplateAction,
  saveLinesAction,
  templateFromContractAction,
} from "@/server/actions/contract-library";
import { listClauses, listServices } from "@/server/services/contract-library";
import { requireStaff } from "@/server/auth/session";
import { listComments } from "@/server/services/contract-workflow";
import { getContract, listMatterChoices } from "@/server/services/contracts";

/** Rédaction d'un contrat (F3). Invisible ou inexistant : même 404 (AGENTS.md §2.9). */
export default async function ContractPage({ params }: PageProps<"/[locale]/admin/contracts/[contractId]">) {
  const { locale, contractId } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const loaded = await getContract(contractId);
  if (!loaded) notFound();
  const [t, services, clauses, comments, matters] = await Promise.all([
    getTranslations("admin.contracts"),
    listServices(true),
    listClauses(loaded.contract.language),
    listComments(contractId),
    role === "firm_admin" && loaded.contract.status === "signed" && !loaded.contract.matter
      ? listMatterChoices()
      : Promise.resolve([]),
  ]);
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
          clientProvince: contract.clientProvince,
          templateDraft: contract.templateDraft,
          templateSigning: contract.templateSigning,
          sentAt: contract.sentAt,
          signingMode: contract.signingMode,
          viewedAt: contract.viewedAt,
          acceptedAt: contract.acceptedAt,
          acceptedName: contract.acceptedName,
          isLawyer: contract.isLawyer,
          matterId: contract.matter?.id ?? null,
          // Compte retrouvé à l'envoi d'après le courriel de la fiche (client invité entre-temps).
          hasClientAccount: Boolean(contract.clientId || contract.recipient),
          needsInvitation: !contract.clientId && !contract.recipient && Boolean(contract.clientEmail),
          recipientLabel: contract.recipient
            ? [contract.recipient.name, `(${contract.recipient.email})`].filter(Boolean).join(" ")
            : null,
          validatedAt: contract.validatedAt,
          validatedBy: contract.validatedBy,
          validatedVersion: contract.validatedVersion,
          pdfSha256: contract.pdfSha256,
          remindedAt: contract.remindedAt,
          canRemind: contract.canRemind,
          declinedAt: contract.declinedAt,
          declineReason: contract.declineReason,
          supersededBy: contract.supersededBy,
          previousId: contract.previousId,
        }}
        comments={comments}
        matterChoices={matters.map((m) => ({
          id: m.id,
          label: [m.display_number, m.title].filter(Boolean).join(" — "),
        }))}
        isFirmAdmin={role === "firm_admin"}
        lines={loaded.lines.map((l) => ({
          description: l.description,
          pricing: l.pricing,
          quantity: l.quantity,
          unit_price: l.unit_price,
          service_id: l.service_id,
        }))}
        services={services.map((sv) => ({
          id: sv.id,
          name: contract.language === "fr" ? sv.name_fr : sv.name_en,
          pricing: sv.pricing,
          amount: sv.amount,
        }))}
        rates={loaded.rates}
        taxesToVerify={loaded.taxesToVerify}
        clauses={clauses.map((c) => ({ id: c.id, title: c.title, body: c.body }))}
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
          saveLines: saveLinesAction,
          templateFromContract: templateFromContractAction,
          publishTemplate: publishTemplateAction,
          workflow: workflowAction,
          comment: commentAction,
        }}
      />
    </>
  );
}
