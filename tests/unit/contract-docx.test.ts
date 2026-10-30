import { describe, expect, it } from "vitest";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import { renderContractDocx } from "@/server/services/contract-docx";

const labels = Object.fromEntries(contractFieldKeys.map((k) => [k, k])) as Record<ContractFieldKey, string>;

describe("Copie Word d'un contrat validé (ADR 0039)", () => {
  it("produit un .docx (archive OOXML) avec sections, listes, champs, annexe et caractères spéciaux", async () => {
    const docx = await renderContractDocx({
      language: "fr",
      title: "Convention <test> & « accents » \u0007",
      sections: [
        {
          title: "Parties",
          body: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Entre " },
                  { type: "field", attrs: { key: "client.name" } },
                  { type: "text", text: " et le Cabinet.", marks: [{ type: "bold" }] },
                ],
              },
              {
                type: "orderedList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Premier point" }] }],
                  },
                ],
              },
            ],
          },
        },
      ],
      values: { "client.name": "Éloïse Démo" },
      labels,
      annex: {
        title: "Annexe",
        cols: {
          description: "Service",
          quantity: "Qté",
          unit: "Prix",
          total: "Total",
          subtotal: "Sous-total",
        },
        lines: [{ description: "Consultation", quantity: "1", unit: "250,00 $", total: "250,00 $" }],
        subtotal: "250,00 $",
        taxes: [{ label: "TVH (15 %)", amount: "37,50 $" }],
        total: "287,50 $",
      },
      footer: "Lex Canada Law — version 1",
      pageLabel: (p, n) => `Page ${p} / ${n}`,
      demo: null,
    });
    // Une archive ZIP (format .docx) commence par « PK ».
    expect(docx.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(docx.length).toBeGreaterThan(3000);
    // Aucune macro (vbaProject) dans l'archive.
    expect(docx.toString("latin1")).not.toContain("vbaProject");
  });
});
