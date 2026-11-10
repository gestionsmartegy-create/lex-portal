"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import type { FormAction } from "@/components/auth/types";

const selectClass = "h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine";
const labelClass = "text-[13px] font-medium text-marine";

/** Réinitialisation de la MFA d'un client (firm_admin) — ADR 0012, docs/runbooks/mfa-reset.md. */
export function MfaResetForm({ action, locale }: { action: FormAction; locale: string }) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <p className="rounded-[2px] border border-gold/40 bg-cream p-4 text-sm text-marine">
        {t("mfaReset.procedure")}
      </p>
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert message={state.ok ? t("mfaReset.done") : undefined} tone="info" />
      <Field id="mfa-email" name="email" type="email" required label={t("mfaReset.clientEmail")} />
      <div className="space-y-2">
        <label htmlFor="mfa-verification" className={labelClass}>
          {t("mfaReset.verification")}
        </label>
        <select
          id="mfa-verification"
          name="verification"
          defaultValue="callback_known_number"
          className={selectClass}
        >
          <option value="callback_known_number">{t("mfaReset.verificationCallback")}</option>
          <option value="in_person_id">{t("mfaReset.verificationInPerson")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="mfa-reason" className={labelClass}>
          {t("mfaReset.reason")}
        </label>
        <select id="mfa-reason" name="reason" defaultValue="lost_device" className={selectClass}>
          <option value="lost_device">{t("mfaReset.reasonLost")}</option>
          <option value="new_device">{t("mfaReset.reasonNew")}</option>
          <option value="other">{t("mfaReset.reasonOther")}</option>
        </select>
      </div>
      <label htmlFor="mfa-confirm" className="flex min-h-6 items-start gap-3 text-sm text-marine">
        <input
          id="mfa-confirm"
          name="confirmed"
          type="checkbox"
          required
          className="mt-0.5 size-4 accent-marine"
        />
        {t("mfaReset.confirm")}
      </label>
      <SubmitButton>{t("mfaReset.submit")}</SubmitButton>
    </form>
  );
}
