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
  "fees.subtotal",
  "fees.taxes",
  "fees.total",
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
// Mots courts courants : jamais pris pour une partie de nom de 2 lettres.
const SHORT_WORDS = new Set([
  "le",
  "la",
  "de",
  "du",
  "et",
  "en",
  "au",
  "un",
  "il",
  "on",
  "ou",
  "ce",
  "se",
  "ne",
  "sa",
  "son",
  "of",
  "to",
  "an",
  "in",
  "at",
  "by",
  "or",
  "is",
  "it",
  "as",
  "be",
  "we",
  "me",
  "mr",
  "ms",
  "dr",
  "st",
]);

const foldChar = (ch: string) => ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Texte « plié » (sans accents ni majuscules) avec, pour chaque caractère plié, la position et la
 * longueur du caractère d'origine : le remplacement se fait aux positions d'origine, quel que soit
 * le nombre de caractères que donne le pliage (accents décomposés, ligatures, alphabets non latins).
 */
function foldWithMap(text: string) {
  let folded = "";
  const start: number[] = [];
  const size: number[] = [];
  let at = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) {
      start.push(at);
      size.push(ch.length);
    }
    folded += f;
    at += ch.length;
  }
  return { folded, start, size };
}

function replaceLoose(text: string, needle: string, label: string): string {
  const target = foldChar(needle);
  if (target.length < 2) return text;
  const { folded, start, size } = foldWithMap(text);
  const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  let out = "";
  let from = 0;
  for (let at = folded.indexOf(target); at !== -1; at = folded.indexOf(target, at + target.length)) {
    // Mot entier seulement pour les parties courtes du nom (évite de masquer « Ana » dans « analyse »).
    if (target.length < 5 && (isWordChar(folded[at - 1]) || isWordChar(folded[at + target.length]))) continue;
    const origStart = start[at]!;
    const last = at + target.length - 1;
    const origEnd = start[last]! + size[last]!;
    if (origStart < from) continue;
    out += text.slice(from, origStart) + label;
    from = origEnd;
  }
  return out + text.slice(from);
}

/**
 * Masquage avant l'IA (ADR 0032, renforcé par l'ADR 0037) : jamais une coordonnée du client vers un tiers.
 *  1. Les coordonnées de la fiche (nom complet ET chaque partie du nom, y compris les noms composés
 *     et ceux de 2 lettres, courriel, adresse et chacune de ses lignes, téléphone), sans tenir compte
 *     des majuscules, des accents ni de leur codage (NFC/NFD).
 *  2. Puis tout ce qui ressemble à une donnée personnelle, même hors de la fiche : courriels, numéros de
 *     téléphone, codes postaux canadiens, suites de 7 chiffres ou plus (NAS, passeport, dossier IRCC…),
 *     sauf les dates (AAAA-MM-JJ) et les montants suivis d'une devise.
 * Le texte est borné par l'appelant avant le masquage ; les répétitions des expressions sont bornées.
 */
export function maskPersonalData(
  text: string,
  party: { name?: string | null; email?: string | null; address?: string | null; phone?: string | null },
) {
  let out = text.normalize("NFC");
  const pairs: [string | null | undefined, string][] = [
    [party.email, "[COURRIEL_CLIENT]"],
    [party.address, "[ADRESSE_CLIENT]"],
    [party.phone, "[TÉLÉPHONE_CLIENT]"],
    [party.name, "[NOM_CLIENT]"],
  ];
  for (const [value, label] of pairs) {
    const v = value?.normalize("NFC").trim();
    if (!v || v.length < 2) continue;
    out = replaceLoose(out, v, label);
    // Adresse sur plusieurs lignes : chaque ligne est aussi masquée.
    if (label === "[ADRESSE_CLIENT]")
      for (const line of v
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 3))
        out = replaceLoose(out, line, label);
    // Nom : chaque partie (prénom, nom de famille, chaque moitié d'un nom composé).
    if (label === "[NOM_CLIENT]")
      for (const part of v.split(/[\s,\-'’.]+/))
        if (part.length >= 3 || (part.length === 2 && !SHORT_WORDS.has(foldChar(part))))
          out = replaceLoose(out, part, label);
  }
  return out
    .replace(/[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,8}\p{L}{2,24}/gu, "[COURRIEL]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[TÉLÉPHONE]")
    .replace(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, "[CODE_POSTAL]")
    .replace(/\b\d(?:[\s-]?\d){6,20}\b/g, (match, offset: number, whole: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(match)) return match;
      const after = whole.slice(offset + match.length, offset + match.length + 12);
      if (/^(?:,\d{1,2})?\s?(?:\$|CAD\b|dollars?\b)/i.test(after)) return match;
      return "[NUMÉRO]";
    });
}
