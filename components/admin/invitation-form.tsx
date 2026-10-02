"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import type { FormAction } from "@/components/auth/types";

type MatterOption = { id: string; display_number: string | null; title: string };

/** Formulaire minimal d'invitation (l'écran complet arrive en J5). */
export function InvitationForm({
  action,
  locale,
  matters,
}: {
  action: FormAction;
  locale: string;
  matters: MatterOption[];
}) {
  const t = useTranslations("admin");
  const ta = useTranslations("auth.common");
  const [state, formAction] = useActionState(action, {});
  const select =
    "h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:outline-none";
  const label = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert message={state.ok ? t("invitations.sent") : undefined} tone="info" />
      <Field id="inv-email" name="email" type="email" required label={ta("email")} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="inv-first" name="firstName" label={t("invitations.firstName")} />
        <Field id="inv-last" name="lastName" label={t("invitations.lastName")} />
      </div>
      <div className="space-y-2">
        <label htmlFor="inv-lang" className={label}>
          {t("invitations.language")}
        </label>
        <select id="inv-lang" name="preferredLanguage" defaultValue={locale} className={select}>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className={label}>{t("invitations.matters")}</legend>
        {matters.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-3 rounded-[2px] border border-gray-100 bg-white p-3 text-sm"
          >
            <input type="checkbox" name="matterIds" value={m.id} className="size-4 accent-[#0d1b3e]" />
            <span className="font-medium text-marine">{m.display_number}</span>
            <span className="text-ink-muted">{m.title}</span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="inv-access" className={label}>
          {t("invitations.access")}
        </label>
        <select id="inv-access" name="accessLevel" defaultValue="read" className={select}>
          <option value="read">{t("invitations.read")}</option>
          <option value="read_write">{t("invitations.readWrite")}</option>
        </select>
      </div>
      <SubmitButton>{t("invitations.submit")}</SubmitButton>
    </form>
  );
}
