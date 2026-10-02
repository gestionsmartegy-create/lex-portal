"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "./form-parts";
import type { FormAction } from "./types";

/** Connexion de démonstration : affichée uniquement en développement (comptes *.test). */
export function StaffDemoLoginForm({ action, locale }: { action: FormAction; locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Field
        id="demo-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        label={t("common.email")}
        placeholder="demo.staff@lexcanadalaw.test"
      />
      <Field
        id="demo-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        label={t("common.password")}
      />
      <SubmitButton>{t("staff.demoSubmit")}</SubmitButton>
    </form>
  );
}
