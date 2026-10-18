import type { ContractDoc, ContractFieldKey, DocNode } from "@/lib/contract-doc";

/**
 * Sections de départ d'un nouveau contrat (page blanche structurée, ADR 0032), en français ou en anglais.
 * Les modèles enregistrés du cabinet arrivent au lot 2 ; ce squelette n'est qu'un point de départ.
 */
const t = (text: string): DocNode => ({ type: "text", text });
const f = (key: ContractFieldKey): DocNode => ({ type: "field", attrs: { key } });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const doc = (...content: DocNode[]): ContractDoc => ({ type: "doc", content });

export type SkeletonSection = { title: string; body: ContractDoc };

export function contractSkeleton(language: "fr" | "en"): SkeletonSection[] {
  if (language === "en") {
    return [
      {
        title: "Parties",
        body: doc(
          p(t("This agreement is made on "), f("date.today"), t(" between:")),
          p(f("firm.name"), t(", represented by "), f("lawyer.name"), t(" (the « Firm »);")),
          p(t("and "), f("client.name"), t(", residing at "), f("client.address"), t(" (the « Client »).")),
        ),
      },
      { title: "Purpose of the mandate", body: doc(p(t("The Client retains the Firm to …"))) },
      { title: "Services", body: doc(p(t("The Firm will provide the following services:"))) },
      { title: "Fees and payment", body: doc(p(t("Fees, disbursements and taxes are set out below."))) },
      {
        title: "Term and termination",
        body: doc(p(t("This agreement takes effect on signature and ends …"))),
      },
      {
        title: "Signatures",
        body: doc(p(t("Client: "), f("client.name")), p(t("For the Firm: "), f("lawyer.name"))),
      },
    ];
  }
  return [
    {
      title: "Parties",
      body: doc(
        p(t("La présente convention est conclue le "), f("date.today"), t(" entre :")),
        p(f("firm.name"), t(", représenté par "), f("lawyer.name"), t(" (le « Cabinet ») ;")),
        p(t("et "), f("client.name"), t(", domicilié au "), f("client.address"), t(" (le « Client »).")),
      ),
    },
    { title: "Objet du mandat", body: doc(p(t("Le Client confie au Cabinet le mandat de …"))) },
    { title: "Services", body: doc(p(t("Le Cabinet fournira les services suivants :"))) },
    {
      title: "Honoraires et paiement",
      body: doc(p(t("Les honoraires, débours et taxes sont précisés ci-dessous."))),
    },
    {
      title: "Durée et résiliation",
      body: doc(p(t("La présente convention prend effet à la signature et se termine …"))),
    },
    {
      title: "Signatures",
      body: doc(p(t("Client : "), f("client.name")), p(t("Pour le Cabinet : "), f("lawyer.name"))),
    },
  ];
}
