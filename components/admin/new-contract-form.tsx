"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { FormAlert } from "@/components/auth/form-parts";

type Client = { id: string; name: string; email: string; phone: string | null; language: "fr" | "en" };
type Matter = { id: string; display_number: string | null; title: string };
type Action = (prev: unknown, formData: FormData) => Promise<{ error?: string }>;

const inputClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/**
 * Nouveau contrat (F2) : client existant (fiche remplie, modifiable) ou nouveau client, dossier lié
 * facultatif. Le serveur revérifie tout (rôle, accès au dossier, client visible, courriel valide).
 */
export function NewContractForm({
  action,
  locale,
  clients,
  matters,
  defaultMatterId,
  templates,
  defaultTemplateId,
  checkEmail,
}: {
  action: Action;
  locale: string;
  clients: Client[];
  matters: Matter[];
  defaultMatterId: string | null;
  /** Modèles publiés (lot 2) : le contrat part de leurs sections et de leur tableau des services. */
  templates: { id: string; name: string; language: "fr" | "en"; domainLabel: string }[];
  defaultTemplateId: string | null;
  checkEmail: (locale: string, email: string) => Promise<boolean>;
}) {
  const t = useTranslations("admin.contracts.newForm");
  const tl = useTranslations("portal.profile.languages");
  const [state, formAction, pending] = useActionState(action, {});
  const [mode, setMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clientLanguage, setClientLanguage] = useState<"fr" | "en">(locale === "fr" ? "fr" : "en");
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const template = templates.find((x) => x.id === templateId);
  const [language, setLanguage] = useState<"fr" | "en">(
    template?.language ?? (locale === "fr" ? "fr" : "en"),
  );
  const tp = useTranslations("admin.contracts.provinces");
  const [known, setKnown] = useState(false);

  const pickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setName(c.name);
    setEmail(c.email);
    setPhone(c.phone ?? "");
    setClientLanguage(c.language);
    if (!template) setLanguage(c.language);
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={mode === "existing" ? clientId : ""} />
      {template ? <input type="hidden" name="language" value={language} /> : null}
      <FormAlert
        message={state.error ? t(`errors.${state.error === "INVALID" ? "INVALID" : "FAILED"}`) : undefined}
      />

      <fieldset className="space-y-4">
        <legend className="mb-2 font-display text-lg font-bold text-marine">{t("contractLegend")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="n-template" className={labelClass}>
              {t("template")}
            </label>
            <select
              id="n-template"
              name="templateId"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const tpl = templates.find((x) => x.id === e.target.value);
                if (tpl) setLanguage(tpl.language);
              }}
              className={inputClass}
            >
              <option value="">{t("blank")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} · {tpl.domainLabel} · {tl(tpl.language)}
                </option>
              ))}
            </select>
            {template ? <p className="text-xs text-ink-muted">{t("templateHelp")}</p> : null}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="n-title" className={labelClass}>
              {t("title")}
            </label>
            <input
              id="n-title"
              name="title"
              required
              maxLength={200}
              placeholder={t("titlePlaceholder")}
              defaultValue={template?.name}
              key={templateId}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="n-language" className={labelClass}>
              {t("language")}
            </label>
            <select
              id="n-language"
              name="language"
              value={language}
              disabled={Boolean(template)}
              onChange={(e) => setLanguage(e.target.value as "fr" | "en")}
              className={inputClass}
            >
              <option value="fr">{tl("fr")}</option>
              <option value="en">{tl("en")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="n-matter" className={labelClass}>
              {t("matter")}
            </label>
            <select id="n-matter" name="matterId" defaultValue={defaultMatterId ?? ""} className={inputClass}>
              <option value="">{t("noMatter")}</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.display_number, m.title].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-display text-lg font-bold text-marine">{t("clientLegend")}</legend>
        <div
          className="flex flex-wrap gap-4 text-sm text-marine"
          role="radiogroup"
          aria-label={t("clientMode")}
        >
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
              disabled={!clients.length}
              className="size-4 accent-gold"
            />
            {t("existingClient")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "new"}
              onChange={() => {
                setMode("new");
                setClientId("");
              }}
              className="size-4 accent-gold"
            />
            {t("newClient")}
          </label>
        </div>
        {mode === "existing" ? (
          <div className="space-y-1">
            <label htmlFor="n-client" className={labelClass}>
              {t("chooseClient")}
            </label>
            <select
              id="n-client"
              value={clientId}
              onChange={(e) => pickClient(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">{t("chooseClientPlaceholder")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="n-name" className={labelClass}>
              {t("clientName")}
            </label>
            <input
              id="n-name"
              name="clientName"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="n-email" className={labelClass}>
              {t("clientEmail")}
            </label>
            <input
              id="n-email"
              name="clientEmail"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={async () =>
                setKnown(mode === "new" && email.includes("@") ? await checkEmail(locale, email) : false)
              }
              aria-describedby={known ? "n-email-known" : undefined}
              className={inputClass}
            />
            {known ? (
              <p id="n-email-known" role="status" className="text-xs text-gold-ink">
                {t("emailKnown")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="n-address" className={labelClass}>
              {t("clientAddress")}
            </label>
            <textarea id="n-address" name="clientAddress" rows={3} maxLength={500} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="n-phone" className={labelClass}>
              {t("clientPhone")}
            </label>
            <input
              id="n-phone"
              name="clientPhone"
              type="tel"
              maxLength={40}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="n-clang" className={labelClass}>
              {t("clientLanguage")}
            </label>
            <select
              id="n-clang"
              name="clientLanguage"
              value={clientLanguage}
              onChange={(e) => setClientLanguage(e.target.value as "fr" | "en")}
              className={inputClass}
            >
              <option value="fr">{tl("fr")}</option>
              <option value="en">{tl("en")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="n-province" className={labelClass}>
              {t("clientProvince")}
            </label>
            <select id="n-province" name="clientProvince" defaultValue="" className={inputClass}>
              <option value="">{t("noProvince")}</option>
              {(["NB", "NS", "ON", "QC", "PE", "NL", "other"] as const).map((pv) => (
                <option key={pv} value={pv}>
                  {tp(pv)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-[8px] bg-marine px-7 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? t("creating") : t("create")}
      </button>
    </form>
  );
}
