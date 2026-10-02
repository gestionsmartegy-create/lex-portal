"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "./form-parts";
import type { FormAction } from "./types";

export function ForgotPasswordForm({ action, locale }: { action: FormAction; locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(action, {});
  if (state.ok) return <FormAlert message={t("forgot.sent")} tone="info" />;
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Field id="email" name="email" type="email" autoComplete="email" required label={t("common.email")} />
      <SubmitButton>{t("forgot.submit")}</SubmitButton>
    </form>
  );
}

/** Nouveau mot de passe : réinitialisation, ou activation d'invitation (avec jeton). */
export function NewPasswordForm({
  action,
  locale,
  token,
  submitLabel,
}: {
  action: FormAction;
  locale: string;
  token?: string;
  submitLabel: string;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Field
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        label={t("common.password")}
        hint={t("common.passwordHint")}
      />
      <Field
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        label={t("common.confirmPassword")}
      />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
