import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { NewContractForm } from "@/components/admin/new-contract-form";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Link } from "@/i18n/navigation";
import { checkClientEmailAction, createContractAction } from "@/server/actions/contracts";
import { requireStaff } from "@/server/auth/session";
import { listTemplates } from "@/server/services/contract-library";
import { listClientChoices, listMatterChoices } from "@/server/services/contracts";

/** Nouveau contrat (F2) : dossier facultatif (pré-rempli depuis l'onglet du dossier), client existant ou nouveau. */
export default async function NewContractPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/contracts/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const [t, clients, matters, templates] = await Promise.all([
    getTranslations("admin.contracts"),
    listClientChoices(),
    listMatterChoices(),
    listTemplates(),
  ]);
  const published = templates.filter((x) => x.status === "published");
  const requestedTemplate = z.uuid().safeParse(sp.template);
  const defaultTemplateId =
    requestedTemplate.success && published.some((x) => x.id === requestedTemplate.data)
      ? requestedTemplate.data
      : null;
  const requested = z.uuid().safeParse(sp.matter);
  // Le dossier proposé doit figurer parmi ceux de la personne : jamais un identifiant cru tel quel.
  const defaultMatterId =
    requested.success && matters.some((m) => m.id === requested.data) ? requested.data : null;

  return (
    <>
      <Link href="/admin/contracts" className="mb-4 inline-flex text-sm text-gold-ink hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("new")} subtitle={t("newSubtitle")} />
      <SectionCard>
        <NewContractForm
          action={createContractAction}
          locale={locale}
          clients={clients}
          matters={matters}
          defaultMatterId={defaultMatterId}
          templates={published.map((x) => ({
            id: x.id,
            name: x.name,
            language: x.language as "fr" | "en",
            domainLabel: t(`editor.template.domains.${x.domain}`),
          }))}
          defaultTemplateId={defaultTemplateId}
          checkEmail={checkClientEmailAction}
        />
      </SectionCard>
    </>
  );
}
