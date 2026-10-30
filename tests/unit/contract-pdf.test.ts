import { describe, expect, it } from "vitest";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import { pdfSafe, renderContractPdf } from "@/server/services/contract-pdf";

const labels = Object.fromEntries(contractFieldKeys.map((k) => [k, k])) as Record<ContractFieldKey, string>;

describe("PDF officiel d'un contrat (ADR 0036)", () => {
  it("remplace les caractères hors WinAnsi et garde les accents et les montants", () => {
    expect(pdfSafe("Éléonore « 2 750,00 $ » — café")).toBe("Éléonore « 2 750,00 $ » — café");
    expect(pdfSafe("Ж ≤ 😀")).toBe("? ? ?");
    expect(pdfSafe("2 750,00 $")).toBe("2 750,00 $");
  });

  it("produit un PDF avec sections, listes, champs et annexe", async () => {
    const pdf = await renderContractPdf({
      language: "fr",
      title: "Convention d'honoraires",
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
                type: "bulletList",
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
        title: "Annexe — Services et honoraires",
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
      footer: "Lex Canada Law — version 1 validée le 21 octobre 2026",
      pageLabel: (p, n) => `Page ${p} / ${n}`,
      demo: null,
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    // Aucun JavaScript ni action automatique dans le document.
    const raw = pdf.toString("latin1");
    expect(raw).not.toMatch(/\/JavaScript|\/OpenAction|\/Launch/);
  });
});
