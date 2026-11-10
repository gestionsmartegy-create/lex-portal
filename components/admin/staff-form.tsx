"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import type { FormAction } from "@/components/auth/types";

/** Pré-création d'un compte du personnel (firm_admin) — ADR 0010. */
export function StaffProvisionForm({ action, locale }: { action: FormAction; locale: string }) {
  const t = useTranslations("admin");
  const ta = useTranslations("auth.common");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-ink-muted">{t("staff.hint")}</p>
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert message={state.ok ? t("staff.created") : undefined} tone="info" />
      <Field
        id="staff-email"
        name="email"
        type="email"
        required
        label={ta("email")}
        placeholder="prenom.nom@lexcanadalaw.com"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="staff-first" name="firstName" required label={t("invitations.firstName")} />
        <Field id="staff-last" name="lastName" required label={t("invitations.lastName")} />
      </div>
      <div className="space-y-2">
        <label htmlFor="staff-role" className="text-[13px] font-medium text-marine">
          {t("staff.role")}
        </label>
        <select
          id="staff-role"
          name="role"
          defaultValue="staff"
          className="h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine"
        >
          <option value="staff">{t("staff.roleStaff")}</option>
          <option value="firm_admin">{t("staff.roleAdmin")}</option>
        </select>
      </div>
      <SubmitButton>{t("staff.submit")}</SubmitButton>
    </form>
  );
}
