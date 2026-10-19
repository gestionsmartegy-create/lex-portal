import { describe, expect, it } from "vitest";
import { computeTotals, fromCents, lineTotal, taxOn, toCents } from "@/lib/money";

/** Montants exacts (AGENTS.md §5, ADR 0034) : centimes BigInt, jamais de virgule flottante. */
describe("montants : centimes exacts", () => {
  it("lit et écrit les montants", () => {
    expect(toCents("1250")).toBe(125000n);
    expect(toCents("0.1")).toBe(10n);
    expect(toCents("2.005")).toBe(201n); // arrondi demi vers le haut
    expect(fromCents(125050n)).toBe("1250.50");
    expect(() => toCents("-1")).toThrow();
    expect(() => toCents("1e3")).toThrow();
  });

  it("0,1 + 0,2 = 0,30 (là où un nombre flottant se tromperait)", () => {
    expect(
      computeTotals(
        [
          { quantity: "1", unit_price: "0.1" },
          { quantity: "1", unit_price: "0.2" },
        ],
        [],
      ).total,
    ).toBe("0.30");
  });

  it("quantité décimale et taux à trois décimales", () => {
    expect(fromCents(lineTotal("1.5", "250.00"))).toBe("375.00");
    expect(fromCents(taxOn(100000n, "9.975"))).toBe("99.75");
    expect(fromCents(taxOn(33333n, "15"))).toBe("50.00"); // 49,9995 → 50,00
  });

  it("Québec : TPS + TVQ ; Nouvelle-Écosse : TVH 14 %", () => {
    const qc = computeTotals(
      [{ quantity: "1", unit_price: "2500.00" }],
      [
        { tax_code: "GST", rate: "5.000" },
        { tax_code: "QST", rate: "9.975" },
      ],
    );
    expect(qc).toEqual({
      subtotal: "2500.00",
      taxes: [
        { code: "GST", rate: "5.000", amount: "125.00" },
        { code: "QST", rate: "9.975", amount: "249.38" },
      ],
      taxTotal: "374.38",
      total: "2874.38",
    });
    expect(
      computeTotals([{ quantity: "2", unit_price: "250" }], [{ tax_code: "HST", rate: "14" }]).total,
    ).toBe("570.00");
  });
});
