"use client";

import { useState } from "react";
import { Download, RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { SendToClient } from "./send-to-client";

type Outcome = { ok: true; id?: string } | { ok: false; code: string };

export type LifecycleContract = {
  id: string;
  status: string;
  matterId: string | null;
  hasClientAccount: boolean;
  /** Fiche du client sans compte (courriel présent, pas de compte lié). */
  needsInvitation: boolean;
  /** « Prénom Nom (courriel) » du compte qui recevra le contrat. */
  recipientLabel: string | null;
  templateSigning: "clio" | "portal" | "both" | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validatedVersion: number | null;
  pdfSha256: string | null;
  sentAt: string | null;
  signingMode: "clio" | "portal" | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  remindedAt: string | null;
  /** Relance possible (dernier avis il y a plus d'un jour), calculé par le serveur. */
  canRemind: boolean;
  declinedAt: string | null;
  declineReason: string | null;
  supersededBy: string | null;
  previousId: string | null;
};

const box = "space-y-2 rounded-[4px] border border-gray-100 bg-white p-4 text-sm text-marine";
const secondary =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-gray-300 px-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50";

/**
 * Cycle de vie d'un contrat après la validation (ADR 0036) : validé (PDF officiel, empreinte, envoi,
 * retour au brouillon), envoyé (suivi, relance, nouvelle version), accepté (ouvrir le dossier),
 * refusé (nouvelle version), remplacé. Chaque action est revérifiée par le serveur et la base.
 */
export function ContractLifecycle({
  locale,
  contract: c,
  busy,
  isFirmAdmin,
  matterChoices,
  deposits,
  clioMatterUrl,
  clioDocumentsLive,
  run,
  workflow,
  send,
}: {
  locale: string;
  contract: LifecycleContract;
  busy: boolean;
  isFirmAdmin: boolean;
  matterChoices: { id: string; label: string }[];
  /** Dépôts du PDF officiel (ADR 0038) : Clio, SharePoint. */
  deposits: {
    id: string;
    version: number;
    target: "clio" | "sharepoint";
    status: string;
    lastError: string | null;
  }[];
  /** Lien vers le dossier dans Clio (connexion réelle seulement), pour lancer la signature. */
  clioMatterUrl: string | null;
  /** Dépôt réel dans Clio autorisé (sinon : « en attente de l'accord du cabinet »). */
  clioDocumentsLive: boolean;
  run: (fn: () => Promise<Outcome>, success?: string) => Promise<void>;
  workflow: (input: unknown) => Promise<Outcome>;
  send: (mode: "clio" | "portal") => Promise<Outcome>;
}) {
  const t = useTranslations("admin.contracts.editor");
  const router = useRouter();
  const [matter, setMatter] = useState("");
  const when = (v: string) => formatDateTime(v, locale);
  const pdfLink = c.validatedVersion ? (
    <a href={`/api/contracts/${c.id}/pdf`} className={secondary}>
      <Download aria-hidden className="size-4" />
      {t("lifecycle.downloadPdf", { version: c.validatedVersion })}
    </a>
  ) : null;
  // Relance : une par jour au plus (la base le revérifie).
  const canRemind = c.canRemind;

  return (
    <>
      {c.previousId ? (
        <p className="rounded-[4px] border border-gray-100 bg-white px-4 py-2 text-xs text-ink-muted">
          {t("lifecycle.replaces")}{" "}
          <a href={`/${locale}/admin/contracts/${c.previousId}`} className="text-gold-ink underline">
            {t("lifecycle.openPrevious")}
          </a>
        </p>
      ) : null}

      {c.validatedAt ? (
        <section aria-labelledby="c-validated" className={box}>
          <h2 id="c-validated" className="font-display text-base font-bold text-marine">
            {t("lifecycle.validatedTitle")}
          </h2>
          <p>
            {t("lifecycle.validatedOn", {
              date: when(c.validatedAt),
              name: c.validatedBy ?? "—",
              version: c.validatedVersion ?? 0,
            })}
          </p>
          {c.pdfSha256 ? (
            <p className="text-xs break-all text-ink-muted">
              {t("lifecycle.fingerprint")} <code className="font-mono">{c.pdfSha256}</code>
            </p>
          ) : null}
          {pdfLink}
          {c.validatedVersion ? (
            <a href={`/api/contracts/${c.id}/docx`} className={secondary}>
              <Download aria-hidden className="size-4" />
              {t("lifecycle.downloadDocx", { version: c.validatedVersion })}
            </a>
          ) : null}
          {c.status === "validated" ? (
            <>
              {c.needsInvitation && isFirmAdmin ? (
                <a href={`/${locale}/admin/invitations?fromContract=${c.id}`} className={secondary}>
                  {t("lifecycle.invite")}
                </a>
              ) : c.needsInvitation ? (
                <p className="text-xs text-ink-muted">{t("lifecycle.askAdminInvite")}</p>
              ) : null}
              <SendToClient
                busy={busy}
                hasClientAccount={c.hasClientAccount}
                recipientLabel={c.recipientLabel}
                missingLabels={[]}
                templateSigning={c.templateSigning}
                onSend={(mode) => void run(() => send(mode), t("send.sent"))}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t("lifecycle.confirmReopen")))
                    void run(() => workflow({ op: "reopen" }), t("lifecycle.reopened"));
                }}
                className={secondary}
              >
                <RotateCcw aria-hidden className="size-4" />
                {t("lifecycle.reopen")}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {deposits.length ? (
        <section aria-labelledby="c-deposits" className={box}>
          <h2 id="c-deposits" className="font-display text-base font-bold text-marine">
            {t("deposits.title")}
          </h2>
          <ul className="space-y-1.5">
            {deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`deposits.targets.${d.target}`)}</span>
                <span className="text-ink-muted">v{d.version}</span>
                <span>
                  {d.status === "waiting"
                    ? t(`deposits.waiting.${d.lastError === "NO_CLIO_MATTER" ? "noMatter" : "microsoft"}`)
                    : d.status === "pending" && d.target === "clio" && !clioDocumentsLive
                      ? t("deposits.waiting.approval")
                      : t(`deposits.status.${d.status}`)}
                </span>
                {d.status === "failed" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => workflow({ op: "retryDeposit", depositId: d.id }), t("deposits.retried"))
                    }
                    className="text-xs font-semibold text-gold-ink underline focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    {t("deposits.retry")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {clioMatterUrl ? (
            <a href={clioMatterUrl} target="_blank" rel="noopener noreferrer" className={secondary}>
              {t("deposits.openClio")}
            </a>
          ) : null}
        </section>
      ) : null}

      {c.sentAt ? (
        <section aria-labelledby="c-sent" className={box}>
          <h2 id="c-sent" className="font-display text-base font-bold text-marine">
            {t("send.trackTitle")}
          </h2>
          <p>
            {t("send.sentOn", { date: when(c.sentAt) })} · {t(`send.modes.${c.signingMode ?? "clio"}`)}
          </p>
          <p>{c.viewedAt ? t("send.viewedOn", { date: when(c.viewedAt) }) : t("send.notViewed")}</p>
          {c.remindedAt ? (
            <p className="text-ink-muted">{t("lifecycle.remindedOn", { date: when(c.remindedAt) })}</p>
          ) : null}
          {c.acceptedAt ? (
            <p className="font-semibold">
              {t("send.acceptedBy", { name: c.acceptedName ?? "", date: when(c.acceptedAt) })}
            </p>
          ) : c.declinedAt ? (
            <div className="rounded-[2px] border border-gray-200 bg-cream px-3 py-2">
              <p className="font-semibold">{t("lifecycle.declinedOn", { date: when(c.declinedAt) })}</p>
              {c.declineReason ? (
                <p className="mt-1 whitespace-pre-line">
                  {t("lifecycle.declineReason", { reason: c.declineReason })}
                </p>
              ) : null}
            </div>
          ) : c.signingMode === "clio" ? (
            <p className="text-ink-muted">{t("send.clioNext")}</p>
          ) : null}

          {c.status === "sent" ? (
            <button
              type="button"
              disabled={busy || !canRemind}
              onClick={() => void run(() => workflow({ op: "remind" }), t("lifecycle.reminded"))}
              className={secondary}
            >
              <Send aria-hidden className="size-4" />
              {t("lifecycle.remind")}
            </button>
          ) : null}
          {c.status === "sent" && !canRemind ? (
            <p className="text-xs text-ink-muted">{t("lifecycle.remindLater")}</p>
          ) : null}
          {c.status === "sent" || c.status === "declined" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("lifecycle.confirmNewVersion"))) return;
                void run(async () => {
                  const r = await workflow({ op: "newVersion" });
                  if (r.ok && r.id) router.push(`/${locale}/admin/contracts/${r.id}`);
                  return r;
                });
              }}
              className={secondary}
            >
              {t("lifecycle.newVersion")}
            </button>
          ) : null}
        </section>
      ) : null}

      {c.status === "signed" && isFirmAdmin ? (
        <section aria-labelledby="c-matter" className={box}>
          <h2 id="c-matter" className="font-display text-base font-bold text-marine">
            {t("lifecycle.matterTitle")}
          </h2>
          {c.matterId ? (
            <a href={`/${locale}/admin/matters/new?matterId=${c.matterId}`} className={secondary}>
              {t("lifecycle.startOpening")}
            </a>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (matter)
                  void run(() => workflow({ op: "linkMatter", matterId: matter }), t("lifecycle.linked"));
              }}
            >
              <label
                htmlFor="c-link-matter"
                className="text-xs font-semibold tracking-[0.05em] text-marine uppercase"
              >
                {t("lifecycle.linkMatter")}
              </label>
              <select
                id="c-link-matter"
                value={matter}
                onChange={(e) => setMatter(e.target.value)}
                required
                className="h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
              >
                <option value="">{t("lifecycle.chooseMatter")}</option>
                {matterChoices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy || !matter} className={secondary}>
                {t("lifecycle.link")}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {c.status === "superseded" && c.supersededBy ? (
        <section aria-labelledby="c-superseded" className={box}>
          <h2 id="c-superseded" className="font-display text-base font-bold text-marine">
            {t("lifecycle.supersededTitle")}
          </h2>
          <a href={`/${locale}/admin/contracts/${c.supersededBy}`} className={secondary}>
            {t("lifecycle.openNew")}
          </a>
        </section>
      ) : null}
    </>
  );
}
