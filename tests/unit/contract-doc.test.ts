import { describe, expect, it } from "vitest";
import {
  contractDocSchema,
  docToText,
  maskPersonalData,
  missingFields,
  textToDoc,
  type ContractDoc,
} from "@/lib/contract-doc";
import { contractSkeleton } from "@/lib/contract-skeleton";

const valid: ContractDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Objet" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Entre ", marks: [{ type: "bold" }] },
        { type: "field", attrs: { key: "client.name" } },
        { type: "hardBreak" },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Un" }] }] },
      ],
    },
  ],
};

describe("contrats : contenu en liste blanche (ADR 0032)", () => {
  it("accepte les nœuds et marques permis, et le squelette de départ", () => {
    expect(contractDocSchema.safeParse(valid).success).toBe(true);
    for (const lang of ["fr", "en"] as const)
      for (const s of contractSkeleton(lang)) expect(contractDocSchema.safeParse(s.body).success).toBe(true);
  });

  it("refuse un type inconnu, un lien, un attribut ajouté ou un faux champ", () => {
    const bad = [
      { type: "doc", content: [{ type: "image", attrs: { src: "https://x" } }] },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            ],
          },
        ],
      },
      { type: "doc", content: [{ type: "paragraph", attrs: { style: "x" }, content: [] }] },
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "field", attrs: { key: "client.ssn" } }] }],
      },
      { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [] }] },
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] },
      "<p>html</p>",
    ];
    for (const b of bad) expect(contractDocSchema.safeParse(b).success).toBe(false);
  });

  it("champs manquants : seulement ceux utilisés et vides", () => {
    const values = {
      "client.name": "",
      "client.email": null,
      "client.address": null,
      "client.phone": null,
      "matter.number": null,
      "matter.title": null,
      "lawyer.name": "Me X",
      "firm.name": "Lex Canada Law",
      "date.today": "18 octobre 2026",
      "fees.subtotal": null,
      "fees.taxes": null,
      "fees.total": null,
    };
    expect(missingFields([valid], values)).toEqual(["client.name"]);
  });

  it("texte ↔ document : paragraphes et liste à puces", () => {
    const doc = textToDoc("Premier.\n- a\n- b\nDernier.");
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "bulletList", "paragraph"]);
    expect(contractDocSchema.safeParse(doc).success).toBe(true);
    expect(docToText(doc, (k) => `[${k}]`)).toBe("Premier.\n- a\n- b\nDernier.");
    expect(docToText(valid, (k) => `[${k}]`)).toContain("Entre [client.name]");
  });
});

describe("contrats : masquage avant l'IA", () => {
  it("remplace nom, courriel, adresse (chaque ligne) et téléphone", () => {
    const party = {
      name: "Riley Demo",
      email: "riley.demo@example.com",
      address: "12 rue Fictive\nMoncton (N.-B.)",
      phone: "506-555-0100",
    };
    const text = "Riley Demo (riley.demo@example.com), 12 rue Fictive, tél. 506-555-0100, à Moncton (N.-B.).";
    const masked = maskPersonalData(text, party);
    for (const v of ["Riley", "riley.demo", "12 rue Fictive", "506-555-0100", "Moncton (N.-B.)"])
      expect(masked).not.toContain(v);
    expect(masked).toContain("[NOM_CLIENT]");
  });

  it("masque aussi les parties du nom, sans tenir compte des accents ni des majuscules (ADR 0037)", () => {
    const party = { name: "Éloïse Tremblay-Gagnon", email: null, address: null, phone: null };
    const masked = maskPersonalData("Mme ELOISE et M. tremblay-gagnon ; Éloïse signe. Analyse.", party);
    for (const v of ["ELOISE", "tremblay-gagnon", "Éloïse"]) expect(masked).not.toContain(v);
    expect(masked).toContain("Analyse");
  });

  it("masque les données personnelles hors de la fiche (ADR 0037)", () => {
    const masked = maskPersonalData(
      "Écrire à autre@example.com ou au (902) 555-0199, code E1C 4M3, NAS 123 456 789, dossier IRCC 1234567.",
      {},
    );
    for (const v of ["autre@example.com", "555-0199", "E1C 4M3", "123 456 789", "1234567"])
      expect(masked).not.toContain(v);
    expect(masked).toContain("[COURRIEL]");
    expect(masked).toContain("[CODE_POSTAL]");
  });

  it("masque chaque moitié d'un nom composé, les noms de 2 lettres et un texte aux accents décomposés", () => {
    const party = { name: "Éloïse Tremblay-Gagnon", email: null, address: null, phone: null };
    const masked = maskPersonalData(
      "Mme Tremblay a signé ; M. Gagnon aussi. " + "E\u0301loi\u0308se".normalize("NFD"),
      party,
    );
    for (const v of ["Tremblay", "Gagnon", "loi"]) expect(masked).not.toContain(v);
    const ng = maskPersonalData("Mme Ng et le dossier de la cliente 한.", { name: "Li Ng" });
    expect(ng).not.toContain(" Ng ");
    expect(ng).toContain(" le dossier de la ");
    expect(maskPersonalData("ELOISE 한", party)).not.toContain("ELOISE");
  });

  it("garde les dates et les montants, et reste rapide sur un texte piégé", () => {
    const masked = maskPersonalData(
      "Échéance le 2026-10-28 ; honoraires de 1 500 000 $ ; NAS 123 456 789.",
      {},
    );
    expect(masked).toContain("2026-10-28");
    expect(masked).toContain("1 500 000 $");
    expect(masked).not.toContain("123 456 789");
    const start = Date.now();
    maskPersonalData("a@" + "a-".repeat(10_000) + " " + "1-".repeat(10_000) + "a", {});
    expect(Date.now() - start).toBeLessThan(200);
  });
});
