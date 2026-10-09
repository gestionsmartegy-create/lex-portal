import { describe, expect, it, vi } from "vitest";

// Le module importe la session et Supabase ; seules les fonctions pures sont testées ici.
vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));

const { canonicalViewQuery } = await import("@/server/services/matter-board");

/** Même jeu de caractères que la contrainte de la table matter_saved_views (ADR 0023). */
const ALLOWED = /^[A-Za-z0-9=&%._~+-]*$/;
const TYPE = "6f1c2b9e-4a0d-4c7e-9b1a-2f3d4e5a6b7c";

describe("vues enregistrées : filtres canoniques", () => {
  it("ne garde que les filtres connus et valides, dans un ordre fixe", () => {
    const q = canonicalViewQuery({ foo: "bar", status: "hack", alert: "idle", type: TYPE, view: "board" });
    expect(q).toBe(`type=${TYPE}&alert=idle&view=board`);
  });

  it("ignore un mode d'affichage inconnu et une étiquette qui n'est pas un uuid", () => {
    expect(canonicalViewQuery({ view: "javascript:alert(1)", tag: "x" })).toBe("");
  });

  it("encode les caractères de recherche dans le jeu permis en base, « * » compris", () => {
    for (const text of ["a*b", "Dupont & fils", "l'été <script>", "100% /x?y=z"]) {
      const q = canonicalViewQuery({ q: text });
      expect(q).toMatch(ALLOWED);
      expect(new URLSearchParams(q).get("q")).toBe(text);
    }
  });
});
