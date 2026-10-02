import { describe, expect, it } from "vitest";
import { formatCountdown, IDLE_TIMEOUT_MS, idlePhase, WARNING_DURATION_MS } from "@/lib/session-timeout";
import { mfaResetSchema } from "@/server/validation/auth";

const MIN = 60_000;

describe("minuteur d'inactivité (ADR 0012)", () => {
  it("30 min d'inactivité, avertissement 2 min avant", () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * MIN);
    expect(WARNING_DURATION_MS).toBe(2 * MIN);
  });

  it("phases : active, avertissement, expirée", () => {
    expect(idlePhase(0)).toEqual({ phase: "active" });
    expect(idlePhase(28 * MIN - 1)).toEqual({ phase: "active" });
    expect(idlePhase(28 * MIN)).toEqual({ phase: "warning", remainingMs: 2 * MIN });
    expect(idlePhase(29 * MIN + 30_000)).toEqual({ phase: "warning", remainingMs: 30_000 });
    expect(idlePhase(30 * MIN)).toEqual({ phase: "expired" });
  });

  it("compte à rebours lisible", () => {
    expect(formatCountdown(2 * MIN)).toBe("2:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(400)).toBe("0:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("formulaire de réinitialisation MFA", () => {
  const valid = {
    email: " Client@Example.com ",
    verification: "callback_known_number",
    reason: "lost_device",
    confirmed: "on",
    locale: "fr",
  };

  it("accepte une demande complète et normalise l'e-mail", () => {
    const parsed = mfaResetSchema.parse(valid);
    expect(parsed.email).toBe("client@example.com");
  });

  it("exige la confirmation de la vérification d'identité", () => {
    expect(mfaResetSchema.safeParse({ ...valid, confirmed: undefined }).success).toBe(false);
  });

  it("refuse une méthode de vérification inconnue (ex. e-mail)", () => {
    expect(mfaResetSchema.safeParse({ ...valid, verification: "email" }).success).toBe(false);
  });
});
