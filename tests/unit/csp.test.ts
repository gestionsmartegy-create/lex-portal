import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/server/security/csp";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe("Content-Security-Policy", () => {
  it("génère un nonce différent à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 50 }, generateNonce));
    expect(nonces.size).toBe(50);
  });

  it("production : scripts par nonce, sans unsafe-inline ni unsafe-eval", () => {
    const csp = buildCsp({ nonce: "abc", isDev: false });
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-abc'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(directive(csp, "style-src")).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("développement : unsafe-eval autorisé (React), toujours sans unsafe-inline pour les scripts", () => {
    const script = directive(buildCsp({ nonce: "abc", isDev: true }), "script-src");
    expect(script).toContain("'unsafe-eval'");
    expect(script).not.toContain("unsafe-inline");
  });

  it("le relâchement des styles est limité au développement", () => {
    expect(directive(buildCsp({ nonce: "n", isDev: true }), "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(directive(buildCsp({ nonce: "n", isDev: false }), "style-src")).toBe("style-src 'self' 'nonce-n'");
  });

  it("autorise uniquement l'origine Supabase configurée (https + wss)", () => {
    const connect = directive(
      buildCsp({ nonce: "n", isDev: false, supabaseUrl: "https://abc.supabase.co/rest/v1" }),
      "connect-src",
    );
    expect(connect).toBe("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  });
});
