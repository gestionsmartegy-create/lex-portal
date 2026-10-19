import { describe, expect, it } from "vitest";
import { sanitizeSearch } from "@/lib/search-query";

/** Recherche du cabinet (ADR 0033) : le texte ne peut jamais ajouter une condition au filtre PostgREST. */
describe("recherche : nettoyage du texte avant le filtre", () => {
  it("neutralise les caractères qui structurent un filtre .or()", () => {
    for (const evil of ["a,id.neq.0", "x),or(role.eq.client", 'x"),and(title.ilike.*', "%%%", "a_b*c\\d:e"]) {
      const q = sanitizeSearch(evil);
      if (q === null) continue;
      expect(q).not.toMatch(/[,()"%_*\\:]/);
    }
  });

  it("garde le texte utile, dont le point d'un numéro de dossier", () => {
    expect(sanitizeSearch("  2024.001 ")).toBe("2024.001");
    expect(sanitizeSearch("Riley Démo")).toBe("Riley Démo");
  });

  it("refuse un texte trop court ou trop long", () => {
    expect(sanitizeSearch("a")).toBeNull();
    expect(sanitizeSearch(",,")).toBeNull();
    expect(sanitizeSearch("x".repeat(81))).toBeNull();
    expect(sanitizeSearch(42)).toBeNull();
  });
});
