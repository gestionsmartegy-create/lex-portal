import "server-only";
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ContractFieldKey, DocNode } from "@/lib/contract-doc";
import type { PdfInput } from "@/server/services/contract-pdf";

/**
 * Copie Word (.docx) d'un contrat validé (ADR 0039), avec les MÊMES données que le PDF officiel.
 * docx 9.15.0 (revue de dépendance du 2026-10-28) : seulement l'export principal — jamais de HTML,
 * de macro, de fichier joint ni de lien. Le contenu vient de la liste blanche (ADR 0032) ; docx
 * échappe le XML, et les caractères interdits en XML sont retirés.
 * Le PDF reste le document officiel (empreinte SHA-256) ; le Word sert à travailler le texte.
 */
const clean = (text: string) =>
  text.toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");

function runs(nodes: DocNode[] | undefined, input: PdfInput): TextRun[] {
  const out: TextRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      out.push(
        new TextRun({ text: clean(n.text ?? ""), bold: marks.has("bold"), italics: marks.has("italic") }),
      );
    } else if (n.type === "hardBreak") out.push(new TextRun({ text: "", break: 1 }));
    else if (n.type === "field") {
      const key = (n.attrs as { key?: ContractFieldKey } | undefined)?.key;
      if (!key) continue;
      const value = input.values[key];
      out.push(
        value
          ? new TextRun({ text: clean(value) })
          : new TextRun({ text: `[${input.labels[key]}]`, bold: true }),
      );
    }
  }
  return out;
}

function blocks(nodes: DocNode[] | undefined, input: PdfInput, level = 0): Paragraph[] {
  const out: Paragraph[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "paragraph")
      out.push(new Paragraph({ children: runs(n.content, input), spacing: { after: 120 } }));
    else if (n.type === "heading")
      out.push(
        new Paragraph({
          children: runs(n.content, input),
          heading:
            (n.attrs as { level?: number } | undefined)?.level === 2
              ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4,
        }),
      );
    else if (n.type === "bulletList" || n.type === "orderedList") {
      for (const li of n.content ?? []) {
        const [first, ...rest] = li.content ?? [];
        if (first?.type === "paragraph")
          out.push(
            new Paragraph({
              children: runs(first.content, input),
              numbering: {
                reference: n.type === "bulletList" ? "bullets" : "numbers",
                level: Math.min(level, 2),
              },
            }),
          );
        out.push(...blocks(first?.type === "paragraph" ? rest : li.content, input, level + 1));
      }
    }
  }
  return out;
}

const cell = (text: string, bold = false, right = false) =>
  new TableCell({
    children: [
      new Paragraph({
        alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: clean(text), bold })],
      }),
    ],
  });

export async function renderContractDocx(input: PdfInput): Promise<Buffer> {
  // « Page 1 / 2 » ou « Page 1 of 2 » : le libellé traduit, découpé autour des numéros (champs Word).
  const sample = input.pageLabel(-11, -22);
  const [before = "", rest = ""] = sample.split("-11");
  const [between = " / ", after = ""] = rest.split("-22");
  const pageParts = [clean(before), clean(between), clean(after)] as const;
  const body: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun(clean(input.title))],
    }),
  ];
  if (input.demo)
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: clean(input.demo), italics: true })],
      }),
    );
  input.sections.forEach((s, i) => {
    if (s.title)
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun(clean(`${i + 1}. ${s.title}`))],
        }),
      );
    body.push(...blocks(s.body.content, input));
  });
  if (input.annex) {
    const a = input.annex;
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(clean(a.title))] }));
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell(a.cols.description, true),
              cell(a.cols.quantity, true, true),
              cell(a.cols.unit, true, true),
              cell(a.cols.total, true, true),
            ],
          }),
          ...a.lines.map(
            (l) =>
              new TableRow({
                children: [
                  cell(l.description),
                  cell(l.quantity, false, true),
                  cell(l.unit, false, true),
                  cell(l.total, false, true),
                ],
              }),
          ),
          new TableRow({
            children: [cell(""), cell(""), cell(a.cols.subtotal, false, true), cell(a.subtotal, false, true)],
          }),
          ...a.taxes.map(
            (t) =>
              new TableRow({
                children: [cell(""), cell(""), cell(t.label, false, true), cell(t.amount, false, true)],
              }),
          ),
          new TableRow({
            children: [cell(""), cell(""), cell(a.cols.total, true, true), cell(a.total, true, true)],
          }),
        ],
      }),
    );
  }
  const doc = new Document({
    creator: "Lex Canada Law",
    title: clean(input.title),
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
        {
          reference: "numbers",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${clean(input.footer)} · ${pageParts[0]}`, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                  new TextRun({ text: pageParts[1], size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
                  ...(pageParts[2] ? [new TextRun({ text: pageParts[2], size: 16 })] : []),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
