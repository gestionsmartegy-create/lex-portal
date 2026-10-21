/**
 * Montants exacts (AGENTS.md §5) : chaînes décimales en entrée et en sortie, calculs en centimes BigInt.
 * Jamais de nombre à virgule flottante. Arrondi au cent le plus proche, demi vers le haut.
 */
const DECIMAL = /^(\d{1,10})(?:\.(\d{1,3}))?$/;

/** « 1250.5 » → 125050n (centimes). Lève une erreur si le texte n'est pas un montant positif. */
export function toCents(value: string): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new Error("INVALID_AMOUNT");
  const frac = (m[2] ?? "").padEnd(3, "0");
  // Millièmes de dollar, puis arrondi au cent.
  const mills = BigInt(m[1]!) * 1000n + BigInt(frac);
  return (mills + 5n) / 10n;
}

/** Centimes → « 1250.50 ». */
export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** Division arrondie demi vers le haut (valeurs positives). */
function divRound(num: bigint, den: bigint): bigint {
  return (num * 2n + den) / (den * 2n);
}

/** Quantité (2 décimales) × prix unitaire → centimes. */
export function lineTotal(quantity: string, unitPrice: string): bigint {
  const qty = toCents(quantity); // quantité en centièmes
  return divRound(qty * toCents(unitPrice), 100n);
}

/** Taxe en centimes : taux en pour cent avec 3 décimales au plus (« 9.975 »). */
export function taxOn(subtotalCents: bigint, ratePercent: string): bigint {
  const m = /^(\d{1,2})(?:\.(\d{1,3}))?$/.exec(ratePercent.trim());
  if (!m) throw new Error("INVALID_RATE");
  const thousandths = BigInt(m[1]!) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0"));
  return divRound(subtotalCents * thousandths, 100_000n);
}

export type TaxLine = { code: string; rate: string; amount: string };
export type Totals = { subtotal: string; taxes: TaxLine[]; taxTotal: string; total: string };

/** Sous-total, taxes (chacune arrondie) et total d'un tableau de services. */
export function computeTotals(
  lines: { quantity: string; unit_price: string }[],
  rates: { tax_code: string; rate: string }[],
): Totals {
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.unit_price), 0n);
  const order = ["GST", "HST", "PST", "QST"];
  const taxes = [...rates]
    .sort((a, b) => order.indexOf(a.tax_code) - order.indexOf(b.tax_code))
    .map((r) => ({ code: r.tax_code, rate: r.rate, cents: taxOn(subtotal, r.rate) }));
  const taxTotal = taxes.reduce((s, t) => s + t.cents, 0n);
  return {
    subtotal: fromCents(subtotal),
    taxes: taxes.map((t) => ({ code: t.code, rate: t.rate, amount: fromCents(t.cents) })),
    taxTotal: fromCents(taxTotal),
    total: fromCents(subtotal + taxTotal),
  };
}
