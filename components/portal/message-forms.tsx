"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

type Action = (prev: unknown, formData: FormData) => Promise<{ error?: string; ok?: boolean }>;
/** Textes : portail client ou espace cabinet (mêmes clés : composeLabel, bodyLabel, send, sending, subject, start, matter, chooseMatter, errors.*). */
type Namespace = "portal.messages" | "admin.messages";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";

/** Réponse dans un fil. Le serveur revérifie l'accès en écriture (AGENTS.md §2.4). */
export function MessageComposer({
  action,
  locale,
  conversationId,
  namespace = "portal.messages",
}: {
  action: Action;
  locale: string;
  conversationId: string;
  namespace?: Namespace;
}) {
  const t = useTranslations(namespace);
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

/** Nouveau fil : dossier fixe (portail) ou dossier à choisir (espace cabinet). */
export function NewConversationForm({
  action,
  locale,
  matterId,
  matters,
  namespace = "portal.messages",
}: {
  action: Action;
  locale: string;
  matterId?: string;
  matters?: { id: string; label: string }[];
  namespace?: Namespace;
}) {
  const t = useTranslations(namespace);
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {matterId ? <input type="hidden" name="matterId" value={matterId} /> : null}
      <FormAlert message={state.error ? t(`errors.${state.error}`) : undefined} />
      {matters ? (
        <div className="space-y-2">
          <label htmlFor="conversation-matter" className={labelClass}>
            {t("matter")}
          </label>
          <select
            id="conversation-matter"
            name="matterId"
            required
            defaultValue=""
            className={`${fieldClass} h-11`}
          >
            <option value="" disabled>
              {t("chooseMatter")}
            </option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
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
          {t("bodyLabel")}
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
