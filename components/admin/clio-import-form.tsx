"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

type Action = (
  prev: unknown,
  formData: FormData,
) => Promise<{ error?: string; ok?: boolean; matters?: number; bills?: number }>;

/** Import des dossiers d'un contact Clio (firm_admin). L'import ne donne aucun accès. */
export function ClioImportForm({ action, locale }: { action: Action; locale: string }) {
  const t = useTranslations("admin.integrations");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-ink-muted">{t("importHint")}</p>
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert
        message={
          state.ok ? t("imported", { matters: state.matters ?? 0, bills: state.bills ?? 0 }) : undefined
        }
        tone="info"
      />
      <Field id="clio-email" name="email" type="email" required label={t("importEmail")} />
      <SubmitButton>{t("importSubmit")}</SubmitButton>
    </form>
  );
}
