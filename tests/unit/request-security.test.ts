import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_OPTIONS } from "@/server/db/cookie-options";
import { parseClientIp } from "@/server/security/request-context";

describe("cookies de session (revue J3, E1)", () => {
  it("sont HttpOnly, SameSite=Lax et à la racine", () => {
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});

describe("IP du client derrière des proxys de confiance (revue J3, M2)", () => {
  it("ignore les valeurs de gauche, fournies par le client", () => {
    // Le client envoie une fausse IP ; le proxy ajoute la vraie à droite.
    expect(parseClientIp("6.6.6.6, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(parseClientIp("6.6.6.6, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
  });

  it("sans proxy de confiance, n'utilise pas l'en-tête", () => {
    expect(parseClientIp("203.0.113.7", 0)).toBeNull();
  });

  it("refuse les valeurs invalides", () => {
    expect(parseClientIp("not-an-ip", 1)).toBeNull();
    expect(parseClientIp("", 1)).toBeNull();
    expect(parseClientIp(null, 1)).toBeNull();
    expect(parseClientIp("1.2.3.4", 3)).toBeNull();
  });
});
