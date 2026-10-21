"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import { computeTotals } from "@/lib/money";

export type PanelLine = {
  description: string;
  pricing: "flat" | "hourly";
  quantity: string;
  unit_price: string;
  service_id: string | null;
};
type Service = { id: string; name: string; pricing: "flat" | "hourly"; amount: string };
type Outcome = { ok: true } | { ok: false; code: string };

const cell =
  "h-9 w-full rounded-[2px] border border-gray-200 bg-white px-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none disabled:bg-surface";
const QTY = /^\d{1,5}(\.\d{1,2})?$/;
const PRICE = /^\d{1,7}(\.\d{1,2})?$/;

/**
 * Tableau des services et honoraires d'un contrat (F6) : lignes du catalogue ou saisies à la main,
 * sous-total, taxes de la province du client et total, calculés en centimes exacts (lib/money).
 * Le serveur revalide et enregistre le tableau en entier.
 */
export function ServicesPanel({
  locale,
  editable,
  initial,
  services,
  rates,
  provinceLabel,
  taxesToVerify,
  onSave,
}: {
  locale: string;
  editable: boolean;
  initial: PanelLine[];
  services: Service[];
  rates: { tax_code: string; rate: string }[];
  provinceLabel: string | null;
  taxesToVerify: boolean;
  onSave: (lines: PanelLine[]) => Promise<Outcome>;
}) {
  const t = useTranslations("admin.contracts.services");
  const [lines, setLines] = useState<PanelLine[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = lines.every(
    (l) =>
      l.description.trim() &&
      QTY.test(l.quantity) &&
      !/^0+(\.0+)?$/.test(l.quantity) &&
      PRICE.test(l.unit_price),
  );
  const totals = useMemo(
    () => (valid && lines.length ? computeTotals(lines, rates) : null),
    [lines, rates, valid],
  );
  const money = (v: string) => formatMoney(v, locale);

  const change = (i: number, patch: Partial<PanelLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addService = (sid: string) => {
    const s = services.find((x) => x.id === sid);
    if (!s) return;
    setLines((ls) => [
      ...ls,
      { description: s.name, pricing: s.pricing, quantity: "1", unit_price: s.amount, service_id: s.id },
    ]);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    const r = await onSave(lines);
    setBusy(false);
    if (r.ok) {
      setDirty(false);
      setMessage({ text: t("saved") });
    } else setMessage({ text: t("failed"), error: true });
  };

  return (
    <section
      aria-labelledby="services-title"
      className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
    >
      <h2 id="services-title" className="font-display text-base font-bold text-marine">
        {t("title")}
      </h2>
      {lines.length === 0 ? <p className="text-sm text-ink-muted">{t("empty")}</p> : null}
      <ul className="space-y-3">
        {lines.map((l, i) => (
          <li key={i} className="space-y-2 rounded-[4px] border border-gray-100 p-2.5">
            <label className="sr-only" htmlFor={`l-desc-${i}`}>
              {t("description")}
            </label>
            <input
              id={`l-desc-${i}`}
              value={l.description}
              maxLength={300}
              disabled={!editable}
              onChange={(e) => change(i, { description: e.target.value })}
              className={cell}
            />
            <div className="grid grid-cols-[1fr_1.3fr_auto] items-end gap-2">
              <div>
                <label htmlFor={`l-qty-${i}`} className="text-[11px] font-semibold text-ink-muted">
                  {l.pricing === "hourly" ? t("hours") : t("quantity")}
                </label>
                <input
                  id={`l-qty-${i}`}
                  inputMode="decimal"
                  value={l.quantity}
                  disabled={!editable}
                  aria-invalid={!QTY.test(l.quantity) || undefined}
                  onChange={(e) => change(i, { quantity: e.target.value.replace(",", ".") })}
                  className={cell}
                />
              </div>
              <div>
                <label htmlFor={`l-price-${i}`} className="text-[11px] font-semibold text-ink-muted">
                  {l.pricing === "hourly" ? t("hourlyRate") : t("unitPrice")}
                </label>
                <input
                  id={`l-price-${i}`}
                  inputMode="decimal"
                  value={l.unit_price}
                  disabled={!editable}
                  aria-invalid={!PRICE.test(l.unit_price) || undefined}
                  onChange={(e) => change(i, { unit_price: e.target.value.replace(",", ".") })}
                  className={cell}
                />
              </div>
              {editable ? (
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => {
                    setLines((ls) => ls.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-[2px] text-ink-muted hover:bg-cream hover:text-marine focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <label htmlFor="add-service" className="sr-only">
            {t("addFromCatalog")}
          </label>
          <select id="add-service" value="" onChange={(e) => addService(e.target.value)} className={cell}>
            <option value="">{t("addFromCatalog")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {money(s.amount)}
                {s.pricing === "hourly" ? ` ${t("perHour")}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setLines((ls) => [
                ...ls,
                { description: "", pricing: "flat", quantity: "1", unit_price: "0", service_id: null },
              ]);
              setDirty(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-300 px-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
          >
            <Plus aria-hidden className="size-4" />
            {t("addLine")}
          </button>
        </div>
      ) : null}

      <div className="space-y-1 border-t border-gray-100 pt-3 text-sm" aria-live="polite">
        {!valid ? (
          <p className="text-[#B91C1C]">{t("invalid")}</p>
        ) : totals ? (
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t("subtotal")}</dt>
              <dd className="font-semibold text-marine tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            {totals.taxes.map((tx) => (
              <div key={tx.code} className="flex justify-between">
                <dt className="text-ink-muted">
                  {t(`tax.${tx.code}`)} ({tx.rate.replace(/\.?0+$/, "")} %)
                </dt>
                <dd className="text-marine tabular-nums">{money(tx.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-100 pt-1">
              <dt className="font-semibold text-marine">{t("total")}</dt>
              <dd className="font-bold text-marine tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
        ) : null}
        <p className="text-xs text-ink-muted">
          {provinceLabel ? t("province", { province: provinceLabel }) : t("noProvince")}
          {taxesToVerify ? ` ${t("toVerify")}` : ""}
        </p>
      </div>

      {editable ? (
        <button
          type="button"
          disabled={!dirty || !valid || busy}
          onClick={() => void save()}
          className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50"
        >
          {t("save")}
        </button>
      ) : null}
      {message ? (
        <p role={message.error ? "alert" : "status"} className="text-sm text-marine">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
