"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

type Action = (prev: unknown, formData: FormData) => Promise<{ error?: string; ok?: boolean }>;

export function ProfileForm({
  action,
  locale,
  profile,
  emailEnabled,
}: {
  action: Action;
  locale: string;
  profile: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    preferred_language: string;
  };
  emailEnabled: boolean;
}) {
  const t = useTranslations("portal.profile");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <FormAlert message={state.ok ? t("saved") : undefined} tone="info" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="profile-first"
          name="firstName"
          required
          label={t("firstName")}
          defaultValue={profile.first_name ?? ""}
        />
        <Field
          id="profile-last"
          name="lastName"
          required
          label={t("lastName")}
          defaultValue={profile.last_name ?? ""}
        />
      </div>
      <Field
        id="profile-email"
        name="emailReadOnly"
        type="email"
        label={t("email")}
        defaultValue={profile.email}
        readOnly
        hint={t("emailHint")}
      />
      <Field
        id="profile-phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        label={t("phone")}
        defaultValue={profile.phone ?? ""}
      />
      <div className="space-y-2">
        <label
          htmlFor="profile-language"
          className="text-xs font-semibold tracking-[0.05em] text-marine uppercase"
        >
          {t("language")}
        </label>
        <select
          id="profile-language"
          name="preferredLanguage"
          defaultValue={profile.preferred_language === "fr" ? "fr" : "en"}
          className="h-11 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine"
        >
          <option value="en">{t("languages.en")}</option>
          <option value="fr">{t("languages.fr")}</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold tracking-[0.05em] text-marine uppercase">
          {t("notifications")}
        </legend>
        <label htmlFor="profile-email-notif" className="flex min-h-6 items-start gap-3 text-sm text-marine">
          <input
            id="profile-email-notif"
            name="emailNotifications"
            type="checkbox"
            defaultChecked={emailEnabled}
            className="mt-0.5 size-4 accent-marine"
          />
          {t("emailNotifications")}
        </label>
      </fieldset>
      <SubmitButton>{t("save")}</SubmitButton>
    </form>
  );
}
