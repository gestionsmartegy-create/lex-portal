import { describe, expect, it } from "vitest";
import { staffDemoLoginEnabled } from "@/server/auth/demo-login";
import type { ServerEnv } from "@/server/env";

const env = (over: Partial<ServerEnv>) =>
  ({ NODE_ENV: "production", STAFF_DEMO_LOGIN: "disabled", ...over }) as ServerEnv;

describe("connexion de démonstration du personnel (ADR 0016)", () => {
  it("fermée par défaut en production", () => {
    expect(staffDemoLoginEnabled(env({}))).toBe(false);
  });
  it("ouverte en développement", () => {
    expect(staffDemoLoginEnabled(env({ NODE_ENV: "development" }))).toBe(true);
  });
  it("ouverte seulement si le serveur de test l'active explicitement", () => {
    expect(staffDemoLoginEnabled(env({ STAFF_DEMO_LOGIN: "enabled" }))).toBe(true);
  });
});
