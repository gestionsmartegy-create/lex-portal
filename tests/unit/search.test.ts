import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "@/lib/search";

describe("escapeLikePattern", () => {
  it("laisse un texte ordinaire intact (accents compris)", () => {
    expect(escapeLikePattern("Bail commercial é")).toBe("Bail commercial é");
  });
  it("rend littéraux les jokers SQL % et _ et la barre oblique inverse", () => {
    expect(escapeLikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
  it("retire l'astérisque (joker de PostgREST)", () => {
    expect(escapeLikePattern("a*b**")).toBe("ab");
  });
  it("laisse passer sans effet les caractères de syntaxe PostgREST", () => {
    expect(escapeLikePattern("a,b.or(id.eq.1)")).toBe("a,b.or(id.eq.1)");
  });
});
