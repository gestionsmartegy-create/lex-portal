import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintButton } from "@/components/admin/print-button";
import { ContractDocView } from "@/components/shared/contract-doc-view";
import { Link } from "@/i18n/navigation";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import { requireStaff } from "@/server/auth/session";
import { getContract } from "@/server/services/contracts";

/**
 * Aperçu imprimable (F3) : le contrat tel qu'il sera lu, champs remplis, dans la langue du contrat.
 * « Imprimer » ouvre l'impression du navigateur (enregistrement en PDF possible). Le vrai PDF figé
 * est produit à la validation (lot 3).
 */
export default async function ContractPrintPage({
  params,
}: PageProps<"/[locale]/admin/contracts/[contractId]/print">) {
  const { locale, contractId } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const loaded = await getContract(contractId);
  if (!loaded) notFound();
  const [t, tDoc] = await Promise.all([
    getTranslations("admin.contracts"),
    getTranslations({ locale: loaded.contract.language, namespace: "admin.contracts" }),
  ]);
  const labels = Object.fromEntries(
    contractFieldKeys.map((k) => [k, tDoc(`fieldKeys.${k.replace(".", "_")}`)]),
  ) as Record<ContractFieldKey, string>;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link href={`/admin/contracts/${contractId}`} className="text-sm text-gold-ink hover:underline">
          ← {t("backToEditor")}
        </Link>
        <PrintButton label={t("print")} />
        {loaded.missing.length ? (
          <span className="text-sm text-marine">{t("printMissing", { count: loaded.missing.length })}</span>
        ) : null}
      </div>
      <article
        lang={loaded.contract.language}
        className="contract-print mx-auto max-w-3xl rounded-[4px] border border-gray-100 bg-white px-6 py-10 sm:px-12"
      >
        <h1 className="mb-8 text-center font-display text-2xl font-bold text-marine">
          {loaded.contract.title}
        </h1>
        {loaded.sections.map((s, i) => (
          <section key={s.id} className="mb-6">
            {s.title ? (
              <h2 className="mb-2 font-display text-lg font-bold text-marine">
                {i + 1}. {s.title}
              </h2>
            ) : null}
            <ContractDocView doc={s.body} values={loaded.values} labels={labels} />
          </section>
        ))}
        {loaded.contract.isMock ? (
          <p className="mt-10 text-center text-xs text-ink-muted">{t("demoFooter")}</p>
        ) : null}
      </article>
    </>
  );
}
