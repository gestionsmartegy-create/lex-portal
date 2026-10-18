import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { NewContractForm } from "@/components/admin/new-contract-form";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Link } from "@/i18n/navigation";
import { checkClientEmailAction, createContractAction } from "@/server/actions/contracts";
import { requireStaff } from "@/server/auth/session";
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
  const [t, clients, matters] = await Promise.all([
    getTranslations("admin.contracts"),
    listClientChoices(),
    listMatterChoices(),
  ]);
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
          checkEmail={checkClientEmailAction}
        />
      </SectionCard>
    </>
  );
}
