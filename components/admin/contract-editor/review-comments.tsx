"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";

type Outcome = { ok: true } | { ok: false; code: string };
export type ReviewComment = {
  id: string;
  sectionId: string | null;
  body: string;
  author: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

/**
 * Commentaires de relecture (ADR 0036) : un collègue de l'équipe commente une section ou le contrat
 * entier ; on marque « réglé » ou on rouvre. Texte simple, jamais de HTML ; le serveur revalide.
 */
export function ReviewComments({
  locale,
  comments,
  sections,
  canAdd,
  busy,
  run,
  act,
}: {
  locale: string;
  comments: ReviewComment[];
  sections: { id: string; title: string | null }[];
  canAdd: boolean;
  busy: boolean;
  run: (fn: () => Promise<Outcome>, success?: string) => Promise<void>;
  act: (input: unknown) => Promise<Outcome>;
}) {
  const t = useTranslations("admin.contracts.editor.comments");
  const [body, setBody] = useState("");
  const [section, setSection] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const titleOf = new Map(sections.map((s, i) => [s.id, `${i + 1}. ${s.title ?? ""}`]));
  const open = comments.filter((c) => !c.resolvedAt);
  const shown = showResolved ? comments : open;

  return (
    <section
      aria-labelledby="c-comments"
      className="space-y-3 rounded-[4px] border border-gray-100 bg-white p-4"
    >
      <h2
        id="c-comments"
        className="flex items-center gap-2 font-display text-base font-semibold text-marine"
      >
        <MessageSquare aria-hidden className="size-4" />
        {t("title", { count: open.length })}
      </h2>
      {shown.length === 0 ? <p className="text-sm text-ink-muted">{t("none")}</p> : null}
      <ul className="space-y-2">
        {shown.map((c) => (
          <li key={c.id} className="rounded-[4px] border border-gray-100 p-2.5 text-sm text-marine">
            <p className="text-xs text-ink-muted">
              {[
                c.sectionId ? (titleOf.get(c.sectionId) ?? t("removedSection")) : t("whole"),
                c.author ?? "—",
                formatDateTime(c.createdAt, locale),
              ].join(" · ")}
            </p>
            <p className={`mt-1 whitespace-pre-line ${c.resolvedAt ? "text-ink-muted line-through" : ""}`}>
              {c.body}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => act({ op: "resolve", commentId: c.id, resolved: !c.resolvedAt }))}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-ink hover:underline focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              <CheckCircle2 aria-hidden className="size-3.5" />
              {c.resolvedAt ? t("reopen") : t("resolve")}
            </button>
          </li>
        ))}
      </ul>
      {comments.length > open.length ? (
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-gold-ink hover:underline focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
        >
          {showResolved ? t("hideResolved") : t("showResolved", { count: comments.length - open.length })}
        </button>
      ) : null}
      {canAdd ? (
        <form
          className="space-y-2 border-t border-gray-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            void run(async () => {
              const r = await act({ op: "add", sectionId: section || null, body });
              if (r.ok) setBody("");
              return r;
            }, t("added"));
          }}
        >
          <label htmlFor="c-comment-section" className="text-[13px] font-medium text-marine">
            {t("about")}
          </label>
          <select
            id="c-comment-section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="h-9 w-full rounded-[2px] border border-gray-200 bg-white px-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
          >
            <option value="">{t("whole")}</option>
            {sections.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
          <label htmlFor="c-comment-body" className="text-[13px] font-medium text-marine">
            {t("body")}
          </label>
          <textarea
            id="c-comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-[2px] border border-gray-200 bg-white px-3 py-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="inline-flex h-9 items-center rounded-[8px] border border-gray-300 px-3 text-sm font-semibold text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50"
          >
            {t("add")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
