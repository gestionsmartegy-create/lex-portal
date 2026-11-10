import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { PageHeader } from "@/components/portal/ui";
import { ContractDocView } from "@/components/shared/contract-doc-view";
import { PrintButton } from "@/components/admin/print-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { clientContractState } from "@/lib/client-contract-state";
import { contractFieldKeys, type ContractFieldKey } from "@/lib/contract-doc";
import { formatDateTime, formatDecimal, formatMoney } from "@/lib/format";
import { fromCents, lineTotal } from "@/lib/money";
import { acceptContractAction, declineContractAction } from "@/server/actions/client-contracts";
import { requireClientSession } from "@/server/auth/session";
import { getMyContract } from "@/server/services/client-contracts";

const NOTICES = ["accepted", "declined", "invalid", "failed"] as const;
const fieldClass =
  "h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";

/**
 * Un contrat envoyé au client (ADR 0035) : version figée à l'envoi, annexe des services, puis
 * acceptation dans le portail (nom tapé + case) ou indication de la signature dans Clio.
 * Même 404 pour un contrat qui n'est pas le sien.
 */
export default async function ClientContractPage({
  params,
  searchParams,
}: PageProps<"/[locale]/portal/contracts/[contractId]">) {
  const { locale, contractId } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/contracts`);
  const c = await getMyContract(contractId);
  if (!c) notFound();
  const sp = await searchParams;
  const notice = NOTICES.find((n) => n === sp.notice);
  const [t, tDoc] = await Promise.all([
    getTranslations("portal.contracts"),
    getTranslations({ locale: c.language, namespace: "admin.contracts" }),
  ]);
  const labels = Object.fromEntries(
    contractFieldKeys.map((k) => [k, tDoc(`fieldKeys.${k.replace(".", "_")}`)]),
  ) as Record<ContractFieldKey, string>;
  const state = clientContractState(c);
  const money = (v: string) => formatMoney(v, c.language);

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={t("sentOn", { date: formatDateTime(c.sent_at, locale) })}
        actions={
          <StatusBadge
            tone={
              state === "accepted"
                ? "completed"
                : state === "toAccept"
                  ? "urgent"
                  : state === "declined"
                    ? "warning"
                    : "pending"
            }
            label={t(`states.${state}`)}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/portal/contracts" className="text-sm text-gold-ink hover:underline">
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
        {c.pdf_sha256 ? (
          <a
            href={`/api/contracts/${c.id}/pdf`}
            className="inline-flex min-h-9 items-center rounded-[8px] border border-gray-300 px-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
          >
            {t("downloadPdf")}
          </a>
        ) : null}
      </div>
      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice === "failed" || notice === "invalid"}
      />

      <article
        lang={c.language}
        className="contract-print mx-auto mb-6 max-w-3xl rounded-[4px] border border-gray-100 bg-white px-5 py-8 sm:px-12"
      >
        <h2 className="mb-8 text-center font-display text-2xl font-semibold text-marine">{c.title}</h2>
        {c.sections.map((s, i) => (
          <section key={i} className="mb-6">
            {s.title ? (
              <h3 className="mb-2 font-display text-lg font-semibold text-marine">
                {i + 1}. {s.title}
              </h3>
            ) : null}
            <ContractDocView doc={s.body} values={c.values} labels={labels} />
          </section>
        ))}
        {c.lines.length && c.totals ? (
          <section className="mt-8 overflow-x-auto">
            <h3 className="mb-3 font-display text-lg font-semibold text-marine">{tDoc("annex")}</h3>
            <table className="w-full border-collapse text-sm text-marine">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th scope="col" className="py-2 pr-2">
                    {tDoc("annexCols.description")}
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right">
                    {tDoc("annexCols.quantity")}
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right">
                    {tDoc("annexCols.unit")}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    {tDoc("annexCols.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{l.description}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {formatDecimal(l.quantity, c.language)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {money(fromCents(lineTotal(l.quantity, l.unit_price)))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className="py-1.5 pr-2 text-right font-normal">
                    {tDoc("annexCols.subtotal")}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{money(c.totals.subtotal)}</td>
                </tr>
                {c.totals.taxes.map((tx) => (
                  <tr key={tx.code}>
                    <th scope="row" colSpan={3} className="py-1.5 pr-2 text-right font-normal">
                      {tDoc(`services.tax.${tx.code}`)} ({formatDecimal(tx.rate, c.language)} %)
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{money(tx.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-300 font-semibold">
                  <th scope="row" colSpan={3} className="py-2 pr-2 text-right">
                    {tDoc("annexCols.total")}
                  </th>
                  <td className="py-2 text-right tabular-nums">{money(c.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ) : null}
      </article>

      <section
        aria-labelledby="accept-title"
        className="mx-auto max-w-3xl rounded-[8px] border border-gold/50 bg-white p-5 print:hidden"
      >
        <h2 id="accept-title" className="mb-2 font-display text-lg font-semibold text-marine">
          {state === "accepted"
            ? t("acceptedTitle")
            : state === "declined"
              ? t("declinedTitle")
              : state === "toAccept"
                ? t("acceptTitle")
                : t("clioTitle")}
        </h2>
        {state === "accepted" ? (
          <p className="text-sm text-marine">
            {t("acceptedBy", {
              name: c.accepted_name ?? "",
              date: c.accepted_at ? formatDateTime(c.accepted_at, locale) : "",
            })}
          </p>
        ) : state === "declined" ? (
          <p className="text-sm text-marine">
            {t("declinedOn", { date: c.declined_at ? formatDateTime(c.declined_at, locale) : "" })}
          </p>
        ) : state === "toSignClio" ? (
          <p className="text-sm text-marine">{t("clioHelp")}</p>
        ) : (
          <form action={acceptContractAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="contractId" value={c.id} />
            <p className="text-sm text-ink-muted">{t("acceptHelp")}</p>
            <div className="space-y-1">
              <label htmlFor="accept-name" className="text-[13px] font-medium text-marine">
                {t("fullName")}
              </label>
              <input
                id="accept-name"
                name="name"
                required
                minLength={2}
                maxLength={200}
                autoComplete="name"
                className={fieldClass}
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-marine">
              <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-marine" />
              {t("agree")}
            </label>
            <Button type="submit" variant="primary">
              {t("accept")}
            </Button>
          </form>
        )}
        {state === "toAccept" || state === "toSignClio" ? (
          <details className="mt-5 border-t border-gray-100 pt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-marine">{t("declineTitle")}</summary>
            <form action={declineContractAction} className="mt-3 space-y-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="contractId" value={c.id} />
              <p className="text-ink-muted">{t("declineHelp")}</p>
              <label htmlFor="decline-reason" className="text-[13px] font-medium text-marine">
                {t("declineReason")}
              </label>
              <textarea
                id="decline-reason"
                name="reason"
                rows={3}
                maxLength={500}
                className="w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
              />
              <Button type="submit" variant="outline-marine">
                {t("decline")}
              </Button>
            </form>
          </details>
        ) : null}
      </section>
    </>
  );
}
