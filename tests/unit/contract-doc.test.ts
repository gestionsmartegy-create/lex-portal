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
});
