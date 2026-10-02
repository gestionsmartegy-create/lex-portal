"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "./form-parts";
import type { FormAction } from "./types";

type Enrollment = { factorId: string; qrCode: string; secret: string };

/** Enrôlement (QR + clé) ou simple vérification du code TOTP. */
export function MfaForm({
  action,
  locale,
  next,
  enrollment,
}: {
  action: FormAction;
  locale: string;
  next?: string;
  enrollment?: Enrollment;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {enrollment ? <input type="hidden" name="factorId" value={enrollment.factorId} /> : null}
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      {enrollment ? (
        <div className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-5 text-center">
          {/* QR fourni par Supabase Auth sous forme d'image data: (autorisée par la CSP img-src). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt={t("mfa.qrAlt")} width={180} height={180} className="mx-auto" />
          <p className="text-xs text-ink-muted">{t("mfa.manualKey")}</p>
          <code className="block rounded-[2px] bg-surface px-3 py-2 font-mono text-sm tracking-wider break-all text-marine">
            {enrollment.secret}
          </code>
        </div>
      ) : null}
      <Field
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        label={t("mfa.code")}
        placeholder="123456"
      />
      <SubmitButton>{t("mfa.submit")}</SubmitButton>
    </form>
  );
}
