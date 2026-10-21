import "server-only";
import PDFDocument from "pdfkit";
import type { ContractDoc, ContractFieldKey, DocNode } from "@/lib/contract-doc";

/**
 * PDF officiel d'un contrat validé (ADR 0036). pdfkit 0.20.2 (revue de dépendance du 2026-10-21) :
 * polices standard UNIQUEMENT (noms fixes ci-dessous, jamais un chemin ni une donnée d'utilisateur),
 * aucun JavaScript, aucune pièce jointe, aucun lien construit depuis le contenu. Le contenu vient
 * d'une structure déjà validée par la liste blanche (lib/contract-doc), jamais de HTML.
 */
const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
} as const;
const MARINE = "#0D1B3E";
const MUTED = "#4A4A5A";

// Les polices standard sont en WinAnsi : tout autre caractère est remplacé (jamais d'erreur).
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfSafe(text: string): string {
  return text
    .replace(/[   ]/g, " ") // espaces fines du français (montants, « »)
    .replace(/[‐‑‒]/g, "-")
    .replace(/./gsu, (ch) => {
      const c = ch.codePointAt(0)!;
      if (c === 10 || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch))
        return ch;
      return "?";
    });
}

export type PdfInput = {
  language: "fr" | "en";
  title: string;
  sections: { title: string | null; body: ContractDoc }[];
  values: Partial<Record<ContractFieldKey, string | null>>;
  labels: Record<ContractFieldKey, string>;
  annex: {
    title: string;
    cols: { description: string; quantity: string; unit: string; total: string; subtotal: string };
    lines: { description: string; quantity: string; unit: string; total: string }[];
    subtotal: string;
    taxes: { label: string; amount: string }[];
    total: string;
  } | null;
  footer: string;
  pageLabel: (page: number, pages: number) => string;
  demo: string | null;
};

type Run = { text: string; font: string };

function runs(nodes: DocNode[] | undefined, input: PdfInput): Run[] {
  const out: Run[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      const font =
        marks.has("bold") && marks.has("italic")
          ? FONT.boldItalic
          : marks.has("bold")
            ? FONT.bold
            : marks.has("italic")
              ? FONT.italic
              : FONT.regular;
      out.push({ text: n.text ?? "", font });
    } else if (n.type === "hardBreak") out.push({ text: "\n", font: FONT.regular });
    else if (n.type === "field") {
      const key = (n.attrs as { key?: ContractFieldKey } | undefined)?.key;
      if (!key) continue;
      const value = input.values[key];
      out.push(
        value ? { text: value, font: FONT.regular } : { text: `[${input.labels[key]}]`, font: FONT.bold },
      );
    }
  }
  return out.length ? out : [{ text: " ", font: FONT.regular }];
}

export async function renderContractPdf(input: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 64, bottom: 72, left: 64, right: 64 },
    bufferPages: true,
    lang: input.language === "fr" ? "fr-CA" : "en-CA",
    info: { Title: pdfSafe(input.title), Author: "Lex Canada Law", Producer: "Lex Canada Law" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const paragraph = (
    nodes: DocNode[] | undefined,
    opts: { indent?: number; prefix?: string; size?: number } = {},
  ) => {
    const list = runs(nodes, input);
    const size = opts.size ?? 10.5;
    const x = doc.page.margins.left + (opts.indent ?? 0);
    const w = width - (opts.indent ?? 0);
    if (opts.prefix) {
      doc
        .font(FONT.regular)
        .fontSize(size)
        .fillColor(MARINE)
        .text(opts.prefix, x - 14, doc.y, { width: 14, lineBreak: false });
      doc.moveUp();
    }
    list.forEach((r, i) => {
      doc
        .font(r.font)
        .fontSize(size)
        .fillColor(MARINE)
        .text(pdfSafe(r.text), i === 0 ? x : undefined, i === 0 ? doc.y : undefined, {
          width: w,
          continued: i < list.length - 1,
          lineGap: 2,
        });
    });
    doc.moveDown(0.5);
  };

  const blocks = (nodes: DocNode[] | undefined, indent = 0) => {
    for (const n of nodes ?? []) {
      if (n.type === "paragraph") paragraph(n.content, { indent });
      else if (n.type === "heading") {
        doc.moveDown(0.3);
        paragraph(n.content, {
          indent,
          size: (n.attrs as { level?: number } | undefined)?.level === 2 ? 12.5 : 11.5,
        });
      } else if (n.type === "bulletList" || n.type === "orderedList") {
        (n.content ?? []).forEach((li, j) => {
          const [first, ...rest] = li.content ?? [];
          const prefix = n.type === "bulletList" ? "•" : `${j + 1}.`;
          if (first?.type === "paragraph") paragraph(first.content, { indent: indent + 18, prefix });
          blocks(first?.type === "paragraph" ? rest : li.content, indent + 18);
        });
      }
    }
  };

  // Titre
  doc.font(FONT.bold).fontSize(18).fillColor(MARINE).text(pdfSafe(input.title), { align: "center" });
  if (input.demo)
    doc
      .moveDown(0.3)
      .font(FONT.italic)
      .fontSize(9)
      .fillColor(MUTED)
      .text(pdfSafe(input.demo), { align: "center" });
  doc.moveDown(1.2);

  input.sections.forEach((s, i) => {
    if (s.title)
      doc
        .font(FONT.bold)
        .fontSize(13)
        .fillColor(MARINE)
        .text(pdfSafe(`${i + 1}. ${s.title}`), doc.page.margins.left, doc.y, { width });
    doc.moveDown(0.3);
    blocks(s.body.content);
    doc.moveDown(0.4);
  });

  // Annexe : services et honoraires
  if (input.annex) {
    const a = input.annex;
    doc.moveDown(0.8);
    doc
      .font(FONT.bold)
      .fontSize(13)
      .fillColor(MARINE)
      .text(pdfSafe(a.title), doc.page.margins.left, doc.y, { width });
    doc.moveDown(0.4);
    const col = [width * 0.46, width * 0.14, width * 0.2, width * 0.2];
    const row = (cells: string[], font: string, line = false) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      let h = 0;
      cells.forEach((c, i) => {
        doc.font(font).fontSize(9.5).fillColor(MARINE);
        const opts = { width: col[i]! - 6, align: i === 0 ? ("left" as const) : ("right" as const) };
        h = Math.max(h, doc.heightOfString(pdfSafe(c), opts));
        doc.text(pdfSafe(c), x, y, opts);
        x += col[i]!;
      });
      doc.y = y + h + 4;
      if (line)
        doc
          .moveTo(doc.page.margins.left, doc.y - 2)
          .lineTo(doc.page.margins.left + width, doc.y - 2)
          .lineWidth(0.5)
          .strokeColor("#C8C8D0")
          .stroke();
    };
    row([a.cols.description, a.cols.quantity, a.cols.unit, a.cols.total], FONT.bold, true);
    for (const l of a.lines) row([l.description, l.quantity, l.unit, l.total], FONT.regular, true);
    row(["", "", a.cols.subtotal, a.subtotal], FONT.regular);
    for (const t of a.taxes) row(["", "", t.label, t.amount], FONT.regular);
    row(["", "", a.cols.total, a.total], FONT.bold);
  }

  // Pied de page sur chaque page (version, date de validation, page X / Y).
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(pdfSafe(input.footer), doc.page.margins.left, doc.page.height - 44, {
        width: width * 0.75,
        lineBreak: false,
      })
      .text(pdfSafe(input.pageLabel(i + 1, range.count)), doc.page.margins.left, doc.page.height - 44, {
        width,
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
