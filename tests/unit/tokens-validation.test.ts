import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashForKey,
  hashToken,
  isWellFormedToken,
  sameHash,
} from "@/server/security/tokens";
import {
  acceptInvitationSchema,
  loginSchema,
  passwordSchema,
  totpCodeSchema,
} from "@/server/validation/auth";

describe("jetons d'invitation", () => {
  it("sont aléatoires, au bon format, et seul leur SHA-256 est stocké", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateInvitationToken));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(isWellFormedToken(t)).toBe(true);
    const t = generateInvitationToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(sameHash(hashToken(t), hashToken(t))).toBe(true);
    expect(sameHash(hashToken(t), hashToken(generateInvitationToken()))).toBe(false);
  });

  it("les clés de limitation ne contiennent jamais l'e-mail en clair", () => {
    const key = hashForKey("John.Doe@Example.com");
    expect(key).not.toContain("john");
    expect(key).toBe(hashForKey(" john.doe@example.com "));
  });
});

describe("validation Zod", () => {
  it("mot de passe : ≥ 12 caractères et 4 classes", () => {
    expect(passwordSchema.safeParse("Court1!").success).toBe(false);
    expect(passwordSchema.safeParse("toutenminuscule123!").success).toBe(false);
    expect(passwordSchema.safeParse("SansSymbole12345").success).toBe(false);
    expect(passwordSchema.safeParse("Valide-Mot2Passe!").success).toBe(true);
  });

  it("code TOTP : exactement 6 chiffres", () => {
    expect(totpCodeSchema.safeParse({ code: "12345", locale: "en" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "12a456", locale: "en" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "123456", locale: "en" }).success).toBe(true);
  });

  it("e-mail normalisé, langue restreinte", () => {
    const parsed = loginSchema.parse({ email: "  John@Example.COM ", password: "x", locale: "fr" });
    expect(parsed.email).toBe("john@example.com");
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x", locale: "de" }).success).toBe(false);
  });

  it("activation : jeton bien formé et mots de passe identiques", () => {
    const base = { token: generateInvitationToken(), password: "Valide-Mot2Passe!", locale: "en" };
    expect(acceptInvitationSchema.safeParse({ ...base, confirm: "autre" }).success).toBe(false);
    expect(
      acceptInvitationSchema.safeParse({ ...base, token: "court", confirm: base.password }).success,
    ).toBe(false);
    expect(acceptInvitationSchema.safeParse({ ...base, confirm: base.password }).success).toBe(true);
  });
});
