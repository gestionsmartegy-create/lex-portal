import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

const FB = "/en/portal";

describe("safeNextPath (redirections internes uniquement)", () => {
  it.each([
    "/en/portal",
    "/fr/portal/matters",
    "/en/portal/matters/c0000000-0000-4000-8000-000000000142",
    "/en/portal/documents?tab=signed",
    "%2Fen%2Fportal",
  ])("accepte le chemin interne %s", (value) => {
    expect(safeNextPath(value, "en")).toBe(decodeURIComponent(value));
  });

  it.each([
    ["URL absolue", "https://evil.example/phish"],
    ["schéma relatif", "//evil.example"],
    ["antislash", "/\\evil.example"],
    ["antislash encodé", "/%5Cevil.example"],
    ["double barre encodée", "%2F%2Fevil.example"],
    ["double encodage", "%252F%252Fevil.example"],
    ["triple encodage", "%25252F%25252Fevil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["hors langue", "/portal"],
    ["langue inconnue", "/de/portal"],
    ["traversée", "/en/../../etc/passwd"],
    ["caractère de contrôle", "/en/portal%0d%0aSet-Cookie:x=1"],
    ["tabulation", "/en/\tportal"],
    ["paramètre contenant une URL", "/en/login?next=//evil.example"],
    ["paramètre encodé contenant une URL", "/en/login?next=%2F%2Fevil.example"],
    ["paramètre avec schéma", "/en/login?next=https://evil.example"],
    ["encodage invalide", "/en/%E0%A4%A"],
    ["vide", ""],
    ["trop long", `/en/${"a".repeat(600)}`],
  ])("refuse %s", (_label, value) => {
    expect(safeNextPath(value, "en")).toBe(FB);
  });

  it("utilise le repli fourni et la langue courante", () => {
    expect(safeNextPath(null, "fr")).toBe("/fr/portal");
    expect(safeNextPath("//x", "fr", "")).toBe("");
  });
});
