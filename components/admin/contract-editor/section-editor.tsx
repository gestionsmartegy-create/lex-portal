"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Italic from "@tiptap/extension-italic";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import {
  ArrowDown,
  ArrowUp,
  Bold as BoldIcon,
  Heading2,
  Italic as ItalicIcon,
  List,
  ListOrdered,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { contractFieldKeys, textToDoc, type ContractDoc, type ContractFieldKey } from "@/lib/contract-doc";
import { FieldNode, type FieldDisplay } from "./field-node";

type SaveResult = { ok: true } | { ok: false; code: string };
type AiResult = { ok: true; data: { text: string; mock: boolean } } | { ok: false; code: string };

export type SectionEditorProps = {
  section: { id: string; title: string; body: ContractDoc; aiAssisted: boolean };
  index: number;
  count: number;
  editable: boolean;
  display: FieldDisplay;
  /** Bibliothèque de clauses dans la langue du contrat (lot 2). */
  clauses: { id: string; title: string; body: string }[];
  onSave: (
    sectionId: string,
    payload: { title: string; body: string; aiAssisted?: boolean },
  ) => Promise<SaveResult>;
  onAi: (
    sectionId: string,
    kind: "draft" | "rephrase" | "simplify" | "translate",
    instruction: string,
  ) => Promise<AiResult>;
  onMove: (sectionId: string, direction: "up" | "down") => void;
  onRemove: (sectionId: string) => void;
  /** Enregistre la fonction « vider les modifications en attente » (avant une action de structure). */
  register: (sectionId: string, flush: (() => Promise<void>) | null) => void;
  onStatus: (state: "saving" | "saved" | "error" | "locked") => void;
};

const toolClass =
  "inline-flex size-8 items-center justify-center rounded-[2px] text-marine hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none aria-pressed:bg-cream aria-pressed:text-gold-ink disabled:opacity-40";

/** Une section du contrat : titre, texte riche (liste blanche), champs, aide de l'IA à côté. */
export function SectionEditor(props: SectionEditorProps) {
  const { section, editable, display, onSave, onAi, register, onStatus } = props;
  const t = useTranslations("admin.contracts.editor");
  const [title, setTitle] = useState(section.title);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiKind, setAiKind] = useState<"draft" | "rephrase" | "simplify" | "translate">("draft");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<{ text: string; mock: boolean } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const dirty = useRef(false);
  const aiAssisted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const editor = useEditor({
    // Exigences de la revue de sécurité : pas de balise <style> injectée, pas de rendu serveur,
    // contenu uniquement en JSON (jamais de HTML).
    injectCSS: false,
    immediatelyRender: false,
    editable,
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      HardBreak,
      Heading.configure({ levels: [2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      UndoRedo,
      FieldNode.configure({ display }),
    ],
    content: section.body as JSONContent,
    editorProps: {
      attributes: {
        class: "contract-prose min-h-24 px-4 py-3 focus-visible:outline-none",
        "aria-label": t("bodyLabel", { title: section.title || String(props.index + 1) }),
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: () => {
      dirty.current = true;
      schedule();
    },
  });

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || !editor) return;
    dirty.current = false;
    onStatus("saving");
    const r = await onSave(section.id, {
      title: titleRef.current,
      body: JSON.stringify(editor.getJSON()),
      aiAssisted: aiAssisted.current || undefined,
    });
    if (!r.ok) {
      dirty.current = true;
      onStatus(r.code === "LOCKED" ? "locked" : "error");
    } else onStatus("saved");
  }, [editor, onSave, onStatus, section.id]);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), 1200);
  };

  useEffect(() => {
    register(section.id, () => flushRef.current());
    return () => register(section.id, null);
  }, [register, section.id]);

  useEffect(() => {
    // Sans émettre de mise à jour : prendre le verrou ne doit pas déclencher d'enregistrement.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  const insertField = (key: ContractFieldKey) => {
    editor?.chain().focus().insertContent({ type: "field", attrs: { key } }).run();
  };

  const askAi = async () => {
    setAiPending(true);
    setAiError(null);
    await flush();
    const r = await onAi(section.id, aiKind, instruction);
    setAiPending(false);
    if (r.ok) setProposal(r.data);
    else setAiError(r.code);
  };

  /** Accepter la proposition : insérée en JSON (jamais en HTML), section marquée « rédigée avec l'IA ». */
  const accept = (mode: "append" | "replace") => {
    if (!editor || !proposal) return;
    const doc = textToDoc(proposal.text);
    if (mode === "replace") editor.commands.setContent(doc as JSONContent);
    else
      editor
        .chain()
        .focus("end")
        .insertContent((doc.content ?? []) as JSONContent[])
        .run();
    aiAssisted.current = true;
    dirty.current = true;
    setProposal(null);
    void flush();
  };

  const active = (name: string, attrs?: Record<string, unknown>) => Boolean(editor?.isActive(name, attrs));

  return (
    <section aria-labelledby={`sec-${section.id}`} className="rounded-[4px] border border-gray-100 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
        <span className="text-xs font-semibold text-ink-muted tabular-nums" aria-hidden>
          {props.index + 1}.
        </span>
        <label htmlFor={`sec-${section.id}`} className="sr-only">
          {t("sectionTitle")}
        </label>
        <input
          id={`sec-${section.id}`}
          value={title}
          maxLength={200}
          disabled={!editable}
          onChange={(e) => {
            setTitle(e.target.value);
            dirty.current = true;
            schedule();
          }}
          onBlur={() => void flush()}
          className="min-w-0 flex-1 basis-[calc(100%-2rem)] rounded-[2px] border border-transparent bg-transparent px-1 py-1 font-display text-base font-bold text-marine hover:border-gray-200 focus-visible:border-gold focus-visible:outline-none disabled:hover:border-transparent sm:basis-auto"
        />
        {section.aiAssisted ? (
          <span className="rounded-[2px] bg-cream px-2 py-0.5 text-[11px] font-semibold text-gold-ink">
            {t("aiAssisted")}
          </span>
        ) : null}
        {editable ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={toolClass}
              disabled={props.index === 0}
              onClick={() => props.onMove(section.id, "up")}
              aria-label={t("moveUp")}
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              className={toolClass}
              disabled={props.index === props.count - 1}
              onClick={() => props.onMove(section.id, "down")}
              aria-label={t("moveDown")}
            >
              <ArrowDown aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              className={toolClass}
              onClick={() => props.onRemove(section.id)}
              aria-label={t("removeSection")}
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {editable ? (
        <div
          role="toolbar"
          aria-label={t("toolbar")}
          className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-3 py-1"
        >
          <button
            type="button"
            className={toolClass}
            aria-pressed={active("bold")}
            aria-label={t("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <BoldIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-pressed={active("italic")}
            aria-label={t("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-pressed={active("heading", { level: 3 })}
            aria-label={t("heading")}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading2 aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-pressed={active("bulletList")}
            aria-label={t("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-pressed={active("orderedList")}
            aria-label={t("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label={t("undo")}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label={t("redo")}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 aria-hidden className="size-4" />
          </button>
          <label htmlFor={`field-${section.id}`} className="sr-only">
            {t("insertField")}
          </label>
          <select
            id={`field-${section.id}`}
            value=""
            onChange={(e) => {
              if (e.target.value) insertField(e.target.value as ContractFieldKey);
            }}
            className="h-8 rounded-[2px] border border-gray-200 bg-white px-2 text-xs text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
          >
            <option value="">{t("insertField")}</option>
            {contractFieldKeys.map((k) => (
              <option key={k} value={k}>
                {display[k].label}
              </option>
            ))}
          </select>
          {props.clauses.length ? (
            <>
              <label htmlFor={`clause-${section.id}`} className="sr-only">
                {t("insertClause")}
              </label>
              <select
                id={`clause-${section.id}`}
                value=""
                onChange={(e) => {
                  const c = props.clauses.find((x) => x.id === e.target.value);
                  if (!c || !editor) return;
                  // Insertion en JSON (jamais en HTML), à l'endroit du curseur.
                  editor
                    .chain()
                    .focus()
                    .insertContent((textToDoc(c.body).content ?? []) as JSONContent[])
                    .run();
                }}
                className="h-8 max-w-40 rounded-[2px] border border-gray-200 bg-white px-2 text-xs text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
              >
                <option value="">{t("insertClause")}</option>
                {props.clauses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            aria-expanded={aiOpen}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-gold/50 px-2.5 text-xs font-semibold text-gold-ink hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
          >
            <Sparkles aria-hidden className="size-3.5" />
            {t("ai.open")}
          </button>
        </div>
      ) : null}

      <div className={aiOpen && editable ? "grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        <EditorContent editor={editor} />
        {aiOpen && editable ? (
          <aside
            aria-label={t("ai.panel")}
            className="space-y-3 border-t border-gray-100 bg-surface p-4 lg:border-t-0 lg:border-l"
          >
            <p className="text-xs text-ink-muted">{t("ai.help")}</p>
            <label htmlFor={`ai-kind-${section.id}`} className="block text-xs font-semibold text-marine">
              {t("ai.kindLabel")}
            </label>
            <select
              id={`ai-kind-${section.id}`}
              value={aiKind}
              onChange={(e) => setAiKind(e.target.value as typeof aiKind)}
              className="h-9 w-full rounded-[2px] border border-gray-200 bg-white px-2 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
            >
              {(["draft", "rephrase", "simplify", "translate"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`ai.kinds.${k}`)}
                </option>
              ))}
            </select>
            <label htmlFor={`ai-instr-${section.id}`} className="block text-xs font-semibold text-marine">
              {t("ai.instruction")}
            </label>
            <textarea
              id={`ai-instr-${section.id}`}
              value={instruction}
              maxLength={1000}
              rows={3}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("ai.instructionPlaceholder")}
              className="w-full rounded-[2px] border border-gray-200 bg-white px-2 py-1.5 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={() => void askAi()}
              disabled={aiPending}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-marine px-3 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-60"
            >
              <Sparkles aria-hidden className="size-4" />
              {aiPending ? t("ai.pending") : t("ai.ask")}
            </button>
            {aiError ? (
              <p role="alert" className="text-xs text-destructive">
                {t(`ai.errors.${aiError === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE"}`)}
              </p>
            ) : null}
            {proposal ? (
              <div className="space-y-2 rounded-[2px] border border-gold/40 bg-white p-3">
                <p className="text-[11px] font-semibold tracking-[0.05em] text-gold-ink uppercase">
                  {proposal.mock ? t("ai.mockProposal") : t("ai.proposal")}
                </p>
                <p className="max-h-64 overflow-y-auto text-sm whitespace-pre-wrap text-marine">
                  {proposal.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => accept("append")}
                    className="rounded-[2px] border border-gray-200 px-2 py-1 text-xs font-semibold text-marine hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    {t("ai.append")}
                  </button>
                  <button
                    type="button"
                    onClick={() => accept("replace")}
                    className="rounded-[2px] border border-gray-200 px-2 py-1 text-xs font-semibold text-marine hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    {t("ai.replace")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposal(null)}
                    className="rounded-[2px] px-2 py-1 text-xs text-ink-muted hover:underline focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    {t("ai.reject")}
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
