"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Eye, History, Lock, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ContractDoc } from "@/lib/contract-doc";
import { formatDateTime } from "@/lib/format";
import type { FieldDisplay } from "./field-node";
import { SectionEditor } from "./section-editor";
import { ContractLifecycle, type LifecycleContract } from "./contract-lifecycle";
import { ReviewComments, type ReviewComment } from "./review-comments";
import { ServicesPanel, type PanelLine } from "./services-panel";

type Outcome = { ok: true } | { ok: false; code: string };
type LockOutcome =
  | { ok: true; data: { acquired: boolean; holderName: string | null; until: string | null } }
  | { ok: false; code: string };
type AiOutcome = { ok: true; data: { text: string; mock: boolean } } | { ok: false; code: string };

export type WorkspaceProps = {
  locale: string;
  contract: {
    id: string;
    title: string;
    language: "fr" | "en";
    status: string;
    editable: boolean;
    clientName: string;
    clientEmail: string | null;
    clientAddress: string | null;
    clientPhone: string | null;
    clientLanguage: "fr" | "en";
    clientProvince: string | null;
    templateDraft: boolean;
    /** Envoi au client (ADR 0035). */
    hasClientAccount: boolean;
    templateSigning: "clio" | "portal" | "both" | null;
    sentAt: string | null;
    signingMode: "clio" | "portal" | null;
    viewedAt: string | null;
    acceptedAt: string | null;
    acceptedName: string | null;
    /** Lot 3 (ADR 0036) */
    isLawyer: boolean;
  } & Omit<LifecycleContract, "id" | "status">;
  comments: ReviewComment[];
  matterChoices: { id: string; label: string }[];
  deposits: {
    id: string;
    version: number;
    target: "clio" | "sharepoint";
    status: string;
    lastError: string | null;
  }[];
  clioMatterUrl: string | null;
  clioDocumentsLive: boolean;
  isFirmAdmin: boolean;
  /** Tableau des services (lot 2) : lignes, catalogue, taux de la province du client. */
  lines: PanelLine[];
  services: { id: string; name: string; pricing: "flat" | "hourly"; amount: string }[];
  rates: { tax_code: string; rate: string }[];
  taxesToVerify: boolean;
  clauses: { id: string; title: string; body: string }[];
  sections: { id: string; position: number; title: string; body: ContractDoc; aiAssisted: boolean }[];
  versions: { version: number; label: string | null; author: string | null; createdAt: string }[];
  display: FieldDisplay;
  missingLabels: string[];
  actions: {
    acquireLock: (locale: string, id: string) => Promise<LockOutcome>;
    releaseLock: (locale: string, id: string) => Promise<void>;
    saveSection: (locale: string, id: string, sectionId: string, input: unknown) => Promise<Outcome>;
    updateHeader: (locale: string, id: string, input: unknown) => Promise<Outcome>;
    sectionOp: (locale: string, id: string, input: unknown) => Promise<Outcome>;
    version: (locale: string, id: string, input: unknown) => Promise<Outcome>;
    status: (locale: string, id: string, input: unknown) => Promise<Outcome>;
    ai: (locale: string, input: unknown) => Promise<AiOutcome>;
    saveLines: (locale: string, id: string, input: unknown) => Promise<Outcome>;
    templateFromContract: (locale: string, input: unknown) => Promise<Outcome>;
    publishTemplate: (locale: string, id: string) => Promise<Outcome>;
    workflow: (
      locale: string,
      id: string,
      input: unknown,
    ) => Promise<{ ok: true; id?: string } | { ok: false; code: string }>;
    comment: (locale: string, id: string, input: unknown) => Promise<Outcome>;
  };
};

const PROVINCES = ["NB", "NS", "ON", "QC", "PE", "NL", "other"] as const;
const DOMAINS = ["immigration", "legal", "business", "advisory", "other"] as const;

const inputClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none disabled:bg-surface";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/**
 * Espace de rédaction d'un contrat (F3) : verrou d'édition (une personne à la fois, renouvelé toutes
 * les 2 minutes), sections enregistrées automatiquement, fiche du client, versions, relecture, annulation.
 * Toute action de structure vide d'abord les modifications en attente.
 */
export function ContractWorkspace({
  locale,
  contract,
  sections,
  versions,
  display,
  missingLabels,
  actions,
  isFirmAdmin,
  lines,
  services,
  rates,
  taxesToVerify,
  clauses,
  comments,
  matterChoices,
  deposits,
  clioMatterUrl,
  clioDocumentsLive,
}: WorkspaceProps) {
  const t = useTranslations("admin.contracts.editor");
  const tp = useTranslations("admin.contracts.provinces");
  const tl = useTranslations("portal.profile.languages");
  const router = useRouter();
  const [lock, setLock] = useState<"pending" | "mine" | "other" | "closed">(
    contract.editable ? "pending" : "closed",
  );
  const [holder, setHolder] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "locked">("idle");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const flushers = useRef(new Map<string, () => Promise<void>>());

  const register = useCallback((sectionId: string, flush: (() => Promise<void>) | null) => {
    if (flush) flushers.current.set(sectionId, flush);
    else flushers.current.delete(sectionId);
  }, []);
  const flushAll = useCallback(async () => {
    await Promise.all([...flushers.current.values()].map((f) => f()));
  }, []);

  const takeLock = useCallback(async () => {
    const r = await actions.acquireLock(locale, contract.id);
    if (r.ok && r.data.acquired) {
      setLock("mine");
      setHolder(null);
    } else {
      setLock(r.ok ? "other" : "closed");
      setHolder(r.ok ? r.data.holderName : null);
    }
  }, [actions, contract.id, locale]);

  useEffect(() => {
    if (!contract.editable) return;
    // Un onglet laissé ouvert sans activité ne garde pas le verrou : il n'est renouvelé que si la
    // personne a agi dans les 10 dernières minutes ; dès qu'elle revient, on tente de le reprendre.
    let lastActivity = Date.now();
    let idle = false;
    const onActivity = () => {
      lastActivity = Date.now();
      if (idle) {
        idle = false;
        void takeLock();
      }
    };
    document.addEventListener("keydown", onActivity);
    document.addEventListener("pointerdown", onActivity);
    const first = setTimeout(() => void takeLock(), 0);
    const every = setInterval(() => {
      if (Date.now() - lastActivity < 10 * 60_000) void takeLock();
      else idle = true;
    }, 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("keydown", onActivity);
      document.removeEventListener("pointerdown", onActivity);
      void actions.releaseLock(locale, contract.id);
    };
  }, [actions, contract.editable, contract.id, locale, takeLock]);

  // L'état réel du contrat prime : après l'envoi, plus rien n'est modifiable, même sans recharger.
  const editable = contract.editable && lock === "mine";

  const run = async (fn: () => Promise<Outcome>, success?: string) => {
    setBusy(true);
    await flushAll();
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      setMessage(success ? { text: success } : null);
      router.refresh();
    } else
      setMessage({
        text: t(
          `errors.${["LOCKED", "INVALID", "NOT_LAWYER", "MISSING_FIELDS", "NO_CLIENT_ACCOUNT", "TOO_SOON"].includes(r.code) ? r.code : "FAILED"}`,
        ),
        error: true,
      });
  };

  const saveHeader = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(
      () => actions.updateHeader(locale, contract.id, Object.fromEntries(form)),
      t("notices.headerSaved"),
    );
  };

  const saveVersion = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Le formulaire est gardé avant l'attente : après un await, e.currentTarget vaut null.
    const formEl = e.currentTarget;
    const label = String(new FormData(formEl).get("label") ?? "");
    await run(() => actions.version(locale, contract.id, { op: "save", label }), t("notices.versionSaved"));
    formEl.reset();
  };

  const cancel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(
      () => actions.status(locale, contract.id, { op: "cancel", reason: String(form.get("reason") ?? "") }),
      t("notices.cancelled"),
    );
  };

  return (
    <div className="space-y-6">
      {/* État : verrou, enregistrement */}
      <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
        {lock === "other" ? (
          <span className="inline-flex items-center gap-2 rounded-[2px] border border-gold/40 bg-cream px-3 py-1.5 text-marine">
            <Lock aria-hidden className="size-4" />
            {holder ? t("lockedBy", { name: holder }) : t("lockedByOther")}
            <button
              type="button"
              onClick={() => void takeLock()}
              className="ml-2 font-semibold text-gold-ink hover:underline"
            >
              {t("retry")}
            </button>
          </span>
        ) : null}
        {lock === "mine" ? (
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            {saveState === "saving" ? t("saving") : null}
            {saveState === "saved" ? (
              <>
                <CheckCircle2 aria-hidden className="size-4 text-status-completed" />
                {t("saved")}
              </>
            ) : null}
            {saveState === "error" || saveState === "locked" ? (
              <span role="alert" className="inline-flex items-center gap-1.5 font-semibold text-marine">
                <CircleAlert aria-hidden className="size-4 text-destructive" />
                {saveState === "locked" ? t("errors.LOCKED") : t("errors.FAILED")}
              </span>
            ) : null}
            {saveState === "idle" ? t("autosave") : null}
          </span>
        ) : null}
        <a
          href={`/${locale}/admin/contracts/${contract.id}/print`}
          onClick={() => void flushAll()}
          className="ml-auto inline-flex items-center gap-1.5 font-semibold text-gold-ink hover:underline"
        >
          <Eye aria-hidden className="size-4" />
          {t("preview")}
        </a>
      </div>
      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm text-marine"}
        >
          {message.text}
        </p>
      ) : null}
      {missingLabels.length ? (
        <p className="rounded-[2px] border border-gold/40 bg-cream px-3 py-2 text-sm text-marine">
          {t("missing", { fields: missingLabels.join(", ") })}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Sections */}
        <div className="min-w-0 space-y-4">
          {sections.map((s, i) => (
            <SectionEditor
              key={`${s.id}-${JSON.stringify(display)}`}
              section={s}
              index={i}
              count={sections.length}
              editable={editable}
              display={display}
              clauses={clauses}
              register={register}
              onStatus={setSaveState}
              onSave={(sectionId, payload: { title: string; body: string; aiAssisted?: boolean }) =>
                actions.saveSection(locale, contract.id, sectionId, payload)
              }
              onAi={(sectionId, kind, instruction) =>
                actions.ai(locale, { contractId: contract.id, sectionId, kind, instruction })
              }
              onMove={(sectionId, direction) =>
                void run(() => actions.sectionOp(locale, contract.id, { op: "move", sectionId, direction }))
              }
              onRemove={(sectionId) => {
                if (window.confirm(t("confirmRemove")))
                  void run(() => actions.sectionOp(locale, contract.id, { op: "remove", sectionId }));
              }}
            />
          ))}
          {editable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  actions.sectionOp(locale, contract.id, {
                    op: "add",
                    after: sections.length ? sections[sections.length - 1]!.position : -1,
                    title: t("newSection"),
                  }),
                )
              }
              className="inline-flex items-center gap-2 rounded-[4px] border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              <Plus aria-hidden className="size-4" />
              {t("addSection")}
            </button>
          ) : null}
        </div>

        {/* Colonne : client et contrat, versions, statut */}
        <aside className="space-y-4" aria-label={t("sidebar")}>
          <form
            onSubmit={(e) => void saveHeader(e)}
            className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
          >
            <h2 className="font-display text-base font-bold text-marine">{t("clientAndContract")}</h2>
            <fieldset disabled={!editable || busy} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="c-title" className={labelClass}>
                  {t("fields.title")}
                </label>
                <input
                  id="c-title"
                  name="title"
                  required
                  maxLength={200}
                  defaultValue={contract.title}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="c-language" className={labelClass}>
                  {t("fields.language")}
                </label>
                <select
                  id="c-language"
                  name="language"
                  defaultValue={contract.language}
                  className={inputClass}
                >
                  <option value="fr">{tl("fr")}</option>
                  <option value="en">{tl("en")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="c-name" className={labelClass}>
                  {t("fields.clientName")}
                </label>
                <input
                  id="c-name"
                  name="clientName"
                  required
                  maxLength={200}
                  defaultValue={contract.clientName}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="c-email" className={labelClass}>
                  {t("fields.clientEmail")}
                </label>
                <input
                  id="c-email"
                  name="clientEmail"
                  type="email"
                  maxLength={254}
                  defaultValue={contract.clientEmail ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="c-address" className={labelClass}>
                  {t("fields.clientAddress")}
                </label>
                <textarea
                  id="c-address"
                  name="clientAddress"
                  rows={3}
                  maxLength={500}
                  defaultValue={contract.clientAddress ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="c-phone" className={labelClass}>
                  {t("fields.clientPhone")}
                </label>
                <input
                  id="c-phone"
                  name="clientPhone"
                  type="tel"
                  maxLength={40}
                  defaultValue={contract.clientPhone ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="c-clang" className={labelClass}>
                  {t("fields.clientLanguage")}
                </label>
                <select
                  id="c-clang"
                  name="clientLanguage"
                  defaultValue={contract.clientLanguage}
                  className={inputClass}
                >
                  <option value="fr">{tl("fr")}</option>
                  <option value="en">{tl("en")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="c-province" className={labelClass}>
                  {t("fields.clientProvince")}
                </label>
                <select
                  id="c-province"
                  name="clientProvince"
                  defaultValue={contract.clientProvince ?? ""}
                  className={inputClass}
                >
                  <option value="">{t("fields.noProvince")}</option>
                  {PROVINCES.map((pv) => (
                    <option key={pv} value={pv}>
                      {tp(pv)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-60"
              >
                {t("saveHeader")}
              </button>
            </fieldset>
          </form>

          <ServicesPanel
            locale={locale}
            editable={editable}
            initial={lines}
            services={services}
            rates={rates}
            provinceLabel={contract.clientProvince ? tp(contract.clientProvince) : null}
            taxesToVerify={taxesToVerify}
            onSave={async (next) => {
              await flushAll();
              const r = await actions.saveLines(locale, contract.id, next);
              if (r.ok) router.refresh();
              return r;
            }}
          />

          {isFirmAdmin ? (
            <section
              aria-labelledby="c-template"
              className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
            >
              <h2 id="c-template" className="font-display text-base font-bold text-marine">
                {t("template.title")}
              </h2>
              {contract.templateDraft ? (
                <>
                  <p className="text-xs text-ink-muted">{t("template.draftHelp")}</p>
                  <button
                    type="button"
                    disabled={busy || !editable}
                    onClick={() =>
                      void run(async () => {
                        const r = await actions.publishTemplate(locale, contract.id);
                        if (r.ok) router.push(`/${locale}/admin/contracts/templates?notice=published`);
                        return r;
                      }, t("template.published"))
                    }
                    className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50"
                  >
                    {t("template.publish")}
                  </button>
                </>
              ) : (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-gold-ink">
                    {t("template.saveAs")}
                  </summary>
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(
                        () =>
                          actions.templateFromContract(locale, {
                            contractId: contract.id,
                            name: String(f.get("name") ?? ""),
                            domain: String(f.get("domain") ?? "other"),
                            signing: String(f.get("signing") ?? "clio"),
                          }),
                        t("template.created"),
                      );
                    }}
                  >
                    <label htmlFor="tpl-name" className={labelClass}>
                      {t("template.name")}
                    </label>
                    <input
                      id="tpl-name"
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={contract.title}
                      className={inputClass}
                    />
                    <label htmlFor="tpl-domain" className={labelClass}>
                      {t("template.domain")}
                    </label>
                    <select id="tpl-domain" name="domain" defaultValue="other" className={inputClass}>
                      {DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {t(`template.domains.${d}`)}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="tpl-signing" className={labelClass}>
                      {t("template.signing")}
                    </label>
                    <select id="tpl-signing" name="signing" defaultValue="clio" className={inputClass}>
                      {(["clio", "portal", "both"] as const).map((m) => (
                        <option key={m} value={m}>
                          {t(`template.signingModes.${m}`)}
                        </option>
                      ))}
                    </select>
                    {/* Le modèle sera visible de tout le personnel : rien de propre au client ne doit y rester. */}
                    <p className="text-xs text-ink-muted">{t("template.privacyWarning")}</p>
                    <label className="flex items-start gap-2 text-sm text-marine">
                      <input
                        type="checkbox"
                        name="confirmNoClientData"
                        required
                        className="mt-0.5 size-4 accent-marine"
                      />
                      {t("template.privacyConfirm")}
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex h-9 items-center rounded-[8px] border border-gray-300 px-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                    >
                      {t("template.create")}
                    </button>
                  </form>
                </details>
              )}
            </section>
          ) : null}

          <section
            aria-labelledby="c-versions"
            className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
          >
            <h2
              id="c-versions"
              className="flex items-center gap-2 font-display text-base font-bold text-marine"
            >
              <History aria-hidden className="size-4" />
              {t("versions")}
            </h2>
            {editable ? (
              <form onSubmit={(e) => void saveVersion(e)} className="flex gap-2">
                <label htmlFor="v-label" className="sr-only">
                  {t("versionLabel")}
                </label>
                <input
                  id="v-label"
                  name="label"
                  maxLength={120}
                  placeholder={t("versionLabel")}
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label={t("saveVersion")}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-[2px] border border-gray-200 text-marine hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                >
                  <Save aria-hidden className="size-4" />
                </button>
              </form>
            ) : null}
            {versions.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noVersions")}</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-semibold text-marine">v{v.version}</span>{" "}
                      <span className="text-ink-muted">
                        {v.label ?? ""} · {v.author ?? ""} · {formatDateTime(v.createdAt, locale)}
                      </span>
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t("confirmRestore", { version: v.version })))
                            void run(
                              () =>
                                actions.version(locale, contract.id, { op: "restore", version: v.version }),
                              t("notices.restored"),
                            );
                        }}
                        className="shrink-0 text-xs font-semibold text-gold-ink hover:underline"
                      >
                        {t("restore")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ContractLifecycle
            locale={locale}
            contract={{ ...contract }}
            busy={busy}
            isFirmAdmin={isFirmAdmin}
            matterChoices={matterChoices}
            deposits={deposits}
            clioMatterUrl={clioMatterUrl}
            clioDocumentsLive={clioDocumentsLive}
            run={run}
            workflow={(input) => actions.workflow(locale, contract.id, input)}
            send={(mode) => actions.status(locale, contract.id, { op: "send", mode })}
          />
          {editable ? (
            <section
              aria-labelledby="c-status"
              className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
            >
              <h2 id="c-status" className="font-display text-base font-bold text-marine">
                {t("statusTitle")}
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    actions.status(locale, contract.id, {
                      op: "review",
                      status: contract.status === "in_review" ? "draft" : "in_review",
                    }),
                  )
                }
                className="inline-flex h-10 w-full items-center justify-center rounded-[8px] border border-gray-200 px-4 text-sm font-semibold text-marine hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                {contract.status === "in_review" ? t("backToDraft") : t("askReview")}
              </button>
              {contract.templateDraft ? null : contract.isLawyer ? (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  {missingLabels.length ? (
                    <p className="text-xs text-ink-muted">
                      {t("send.needsFields", { fields: missingLabels.join(", ") })}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || missingLabels.length > 0}
                    onClick={() => {
                      if (window.confirm(t("lifecycle.confirmValidate")))
                        void run(
                          () => actions.workflow(locale, contract.id, { op: "validate" }),
                          t("lifecycle.validated"),
                        );
                    }}
                    className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50"
                  >
                    {t("lifecycle.validate")}
                  </button>
                  <p className="text-xs text-ink-muted">{t("lifecycle.validateHelp")}</p>
                </div>
              ) : (
                <p className="border-t border-gray-100 pt-3 text-xs text-ink-muted">
                  {t("lifecycle.lawyerOnly")}
                </p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-destructive">
                  {t("cancelTitle")}
                </summary>
                <form onSubmit={(e) => void cancel(e)} className="mt-2 space-y-2">
                  <label htmlFor="c-reason" className={labelClass}>
                    {t("cancelReason")}
                  </label>
                  <textarea
                    id="c-reason"
                    name="reason"
                    required
                    rows={2}
                    maxLength={500}
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-[8px] bg-destructive/10 px-3 text-sm font-semibold text-destructive hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    {t("cancelConfirm")}
                  </button>
                </form>
              </details>
            </section>
          ) : null}
          {contract.templateDraft ? null : (
            <ReviewComments
              locale={locale}
              comments={comments}
              sections={sections.map((sct) => ({ id: sct.id, title: sct.title }))}
              canAdd={["draft", "in_review", "validated"].includes(contract.status)}
              busy={busy}
              run={run}
              act={(input) => actions.comment(locale, contract.id, input)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
