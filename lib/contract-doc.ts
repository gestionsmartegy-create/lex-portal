import { z } from "zod";

/**
 * Contenu d'une section de contrat (ADR 0032) : JSON ProseMirror, en LISTE BLANCHE.
 * Nœuds permis : doc, paragraph, heading (niveaux 2 et 3), bulletList, orderedList, listItem, text,
 * hardBreak, field (champ rempli à partir du contrat). Marques permises : bold, italic.
 * Tout autre type est refusé à l'écriture (serveur) et ignoré à l'affichage. Jamais de HTML brut.
 */
export const contractStatuses = [
  "draft",
  "in_review",
  "validated",
  "sent",
  "signed",
  "declined",
  "cancelled",
  "superseded",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export const contractFieldKeys = [
  "client.name",
  "client.email",
  "client.address",
  "client.phone",
  "matter.number",
  "matter.title",
  "lawyer.name",
  "firm.name",
  "date.today",
] as const;
export type ContractFieldKey = (typeof contractFieldKeys)[number];

const MAX_DEPTH = 8;
const MAX_TEXT = 20_000;

const markSchema = z.object({ type: z.enum(["bold", "italic"]) }).strict();

export type DocNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: "bold" | "italic" }[];
  content?: DocNode[];
};

const textNode = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(MAX_TEXT),
    marks: z.array(markSchema).max(2).optional(),
  })
  .strict();
const hardBreak = z.object({ type: z.literal("hardBreak") }).strict();
const field = z
  .object({ type: z.literal("field"), attrs: z.object({ key: z.enum(contractFieldKeys) }).strict() })
  .strict();
const inline = z.union([textNode, hardBreak, field]);

function block(depth: number): z.ZodType<DocNode> {
  if (depth > MAX_DEPTH) return z.never();
  const inlineContent = z.array(inline).max(2_000).optional();
  return z.lazy(() =>
    z.union([
      z.object({ type: z.literal("paragraph"), content: inlineContent }).strict(),
      z
        .object({
          type: z.literal("heading"),
          attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
          content: inlineContent,
        })
        .strict(),
      z
        .object({
          type: z.enum(["bulletList", "orderedList"]),
          attrs: z
            .object({
              start: z.number().int().min(1).max(999).optional(),
              // Type de numérotation de TipTap (« 1 », « a », « i »…) : court, sans autre attribut.
              type: z.string().max(4).nullable().optional(),
            })
            .strict()
            .optional(),
          content: z
            .array(
              z
                .object({
                  type: z.literal("listItem"),
                  content: z
                    .array(block(depth + 1))
                    .min(1)
                    .max(50),
                })
                .strict(),
            )
            .min(1)
            .max(200),
        })
        .strip(),
    ]),
  ) as z.ZodType<DocNode>;
}

export const contractDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(block(0)).max(500).optional() })
  .strict();
export type ContractDoc = { type: "doc"; content?: DocNode[] };

export const emptyDoc = (): ContractDoc => ({ type: "doc", content: [] });

/** Valeurs des champs d'un contrat (null : à compléter). */
export type FieldValues = Record<ContractFieldKey, string | null>;

/** Champs vides utilisés dans le document (pour bloquer la validation et les surligner). */
export function missingFields(docs: ContractDoc[], values: FieldValues): ContractFieldKey[] {
  const used = new Set<ContractFieldKey>();
  const walk = (nodes: DocNode[] | undefined) => {
    for (const n of nodes ?? []) {
      if (n.type === "field") used.add((n.attrs as { key: ContractFieldKey }).key);
      walk(n.content);
    }
  };
  for (const d of docs) walk(d.content);
  return [...used].filter((k) => !values[k]?.trim());
}

/** Texte brut d'un document (aperçu, IA). Les champs deviennent leur valeur ou une étiquette. */
export function docToText(doc: ContractDoc, field: (key: ContractFieldKey) => string): string {
  const out: string[] = [];
  const inlineText = (nodes: DocNode[] | undefined) =>
    (nodes ?? [])
      .map((n) =>
        n.type === "text"
          ? (n.text ?? "")
          : n.type === "hardBreak"
            ? "\n"
            : n.type === "field"
              ? field((n.attrs as { key: ContractFieldKey }).key)
              : "",
      )
      .join("");
  const walk = (nodes: DocNode[] | undefined, prefix = "") => {
    for (const n of nodes ?? []) {
      if (n.type === "paragraph" || n.type === "heading") out.push(prefix + inlineText(n.content));
      else if (n.type === "bulletList" || n.type === "orderedList")
        for (const item of n.content ?? []) walk(item.content, "- ");
    }
  };
  walk(doc.content);
  return out.join("\n");
}

/** Texte → document (paragraphes ; « - » en début de ligne : liste à puces). Sert aux propositions de l'IA. */
export function textToDoc(text: string): ContractDoc {
  const content: DocNode[] = [];
  let list: DocNode | null = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd().slice(0, MAX_TEXT);
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet?.[1]) {
      list ??= { type: "bulletList", content: [] };
      list.content!.push({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: bullet[1] }] }],
      });
      continue;
    }
    if (list) {
      content.push(list);
      list = null;
    }
    if (line.trim()) content.push({ type: "paragraph", content: [{ type: "text", text: line.trim() }] });
  }
  if (list) content.push(list);
  return { type: "doc", content: content.slice(0, 500) };
}

/**
 * Masquage avant tout envoi à un service d'IA (ADR 0032, plan des contrats §4.10) : les coordonnées du
 * client sont remplacées par des étiquettes, et les champs par leur clé. L'IA ne voit jamais le vrai
 * nom, le courriel, l'adresse ni le téléphone.
 */
export function maskPersonalData(
  text: string,
  party: { name?: string | null; email?: string | null; address?: string | null; phone?: string | null },
) {
  let out = text;
  const pairs: [string | null | undefined, string][] = [
    [party.email, "[COURRIEL_CLIENT]"],
    [party.address, "[ADRESSE_CLIENT]"],
    [party.phone, "[TÉLÉPHONE_CLIENT]"],
    [party.name, "[NOM_CLIENT]"],
  ];
  for (const [value, label] of pairs) {
    const v = value?.trim();
    if (!v || v.length < 2) continue;
    out = out.split(v).join(label);
    // Adresse sur plusieurs lignes : chaque ligne est aussi masquée.
    if (label === "[ADRESSE_CLIENT]")
      for (const line of v
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 3))
        out = out.split(line).join(label);
  }
  return out;
}
