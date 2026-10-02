"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

type Action = (prev: unknown, formData: FormData) => Promise<{ error?: string; ok?: boolean }>;

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";

/** Réponse dans un fil. Le serveur revérifie l'accès read_write (AGENTS.md §2.4). */
export function MessageComposer({
  action,
  locale,
  conversationId,
}: {
  action: Action;
  locale: string;
  conversationId: string;
}) {
  const t = useTranslations("portal.messages");
  const [state, formAction, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <label htmlFor="message-body" className={labelClass}>
        {t("composeLabel")}
      </label>
      <textarea id="message-body" name="body" rows={4} maxLength={5000} required className={fieldClass} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="brand" disabled={pending}>
          <Send aria-hidden className="size-4" /> {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}

export function NewConversationForm({
  action,
  locale,
  matterId,
}: {
  action: Action;
  locale: string;
  matterId: string;
}) {
  const t = useTranslations("portal.messages");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="matterId" value={matterId} />
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      <div className="space-y-2">
        <label htmlFor="conversation-subject" className={labelClass}>
          {t("subject")}
        </label>
        <input
          id="conversation-subject"
          name="subject"
          required
          maxLength={200}
          className={`${fieldClass} h-11`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="conversation-body" className={labelClass}>
          {t("composeLabel")}
        </label>
        <textarea
          id="conversation-body"
          name="body"
          rows={4}
          maxLength={5000}
          required
          className={fieldClass}
        />
      </div>
      <Button type="submit" variant="primary" size="brand" disabled={pending}>
        {pending ? t("sending") : t("start")}
      </Button>
    </form>
  );
}
