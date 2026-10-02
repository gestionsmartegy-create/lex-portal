import "server-only";
import type { DocumentContent, DocumentLocation, DocumentStore } from "./gateway";

/**
 * MockDocumentStore (AGENTS.md §2.6-7) : reproduit les sous-dossiers SharePoint
 * (la visibilité est portée par documents.folder en base) et renvoie, pour tout
 * document, un PDF de DÉMONSTRATION généré — jamais un vrai fichier.
 */
export class MockDocumentStore implements DocumentStore {
  async openContent(_location: DocumentLocation, meta: { displayName: string }): Promise<DocumentContent> {
    const bytes = demoPdf(meta.displayName);
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      contentType: "application/pdf",
      size: bytes.byteLength,
    };
  }
}

/** PDF minimal valide (1 page) : « Document de démonstration / Demo document » + nom. */
export function demoPdf(title: string): Uint8Array {
  const safe = title
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/([\\()])/g, "\\$1")
    .slice(0, 80);
  const text = `BT /F1 18 Tf 72 720 Td (Lex Canada Law - Demo document / Document de demonstration) Tj 0 -32 Td /F1 12 Tf (${safe}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
