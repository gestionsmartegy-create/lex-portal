"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import type { FormAction } from "@/components/auth/types";

/** Octroi d'accès à un client existant (firm_admin). Le serveur revérifie rôle et cible. */
export function GrantAccessForm({
  action,
  locale,
  matterId,
}: {
  action: FormAction;
  locale: string;
  matterId: string;
}) {
  const t = useTranslations("admin.matters");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="matterId" value={matterId} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert message={state.ok ? t("granted") : undefined} tone="info" />
      <Field id="grant-email" name="email" type="email" required label={t("grantEmail")} />
      <div className="space-y-2">
        <label
          htmlFor="grant-level"
          className="text-xs font-semibold tracking-[0.05em] text-marine uppercase"
        >
          {t("grant")}
        </label>
        <select
          id="grant-level"
          name="accessLevel"
          defaultValue="read"
          className="h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine"
        >
          <option value="read">{t("levelRead")}</option>
          <option value="read_write">{t("levelWrite")}</option>
        </select>
      </div>
      <SubmitButton>{t("grantSubmit")}</SubmitButton>
    </form>
  );
}
