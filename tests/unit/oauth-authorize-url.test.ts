import { describe, expect, it } from "vitest";
import { toBrowserAuthorizeUrl } from "@/lib/oauth-authorize-url";

const query =
  "?provider=azure&redirect_to=https%3A%2F%2Fportail.test%2Fapi%2Fauth%2Fcallback&code_challenge=abc";

describe("toBrowserAuthorizeUrl", () => {
  it("garde l'adresse telle quelle quand Supabase est déjà public", () => {
    const url = `http://127.0.0.1:54321/auth/v1/authorize${query}`;
    expect(toBrowserAuthorizeUrl(url, "http://127.0.0.1:54321")).toBe(url);
  });

  it("remplace l'adresse interne par l'adresse publique (serveur de test)", () => {
    expect(
      toBrowserAuthorizeUrl(
        `http://gateway:8000/auth/v1/authorize${query}`,
        "http://gateway:8000",
        "https://lexlaw.example.com",
      ),
    ).toBe(`https://lexlaw.example.com/auth/v1/authorize${query}`);
  });

  it("refuse une autre origine que notre Supabase", () => {
    expect(
      toBrowserAuthorizeUrl(`https://evil.example.com/auth/v1/authorize${query}`, "http://gateway:8000"),
    ).toBeNull();
  });

  it("refuse un autre chemin que l'autorisation", () => {
    expect(
      toBrowserAuthorizeUrl(
        "http://gateway:8000/auth/v1/admin/users",
        "http://gateway:8000",
        "https://a.example",
      ),
    ).toBeNull();
    expect(toBrowserAuthorizeUrl("http://gateway:8000/rest/v1/matters", "http://gateway:8000")).toBeNull();
  });

  it("refuse une adresse publique non HTTPS ou invalide", () => {
    const url = `http://gateway:8000/auth/v1/authorize${query}`;
    expect(toBrowserAuthorizeUrl(url, "http://gateway:8000", "http://lexlaw.example.com")).toBeNull();
    expect(toBrowserAuthorizeUrl(url, "http://gateway:8000", "pas une adresse")).toBeNull();
    expect(toBrowserAuthorizeUrl("pas une adresse", "http://gateway:8000")).toBeNull();
  });

  it("ne garde que l'origine de l'adresse publique (pas de chemin injecté)", () => {
    expect(
      toBrowserAuthorizeUrl(
        `http://gateway:8000/auth/v1/authorize${query}`,
        "http://gateway:8000",
        "https://lexlaw.example.com/autre/chemin",
      ),
    ).toBe(`https://lexlaw.example.com/auth/v1/authorize${query}`);
  });
});
