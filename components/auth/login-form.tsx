"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { Field, FormAlert, SubmitButton } from "./form-parts";
import type { FormAction } from "./types";

export function LoginForm({
  action,
  locale,
  next,
  notice,
}: {
  action: FormAction;
  locale: string;
  next?: string;
  notice?: string;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormAlert message={notice} tone="info" />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Field
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        label={t("common.email")}
        placeholder="your@email.com"
      />
      <Field
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        label={t("common.password")}
        aside={
          <Link
            href="/forgot-password"
            className="inline-flex min-h-6 items-center text-xs text-gold-ink hover:underline"
          >
            {t("login.forgot")}
          </Link>
        }
      />
      <SubmitButton>{t("login.submit")}</SubmitButton>
    </form>
  );
}
