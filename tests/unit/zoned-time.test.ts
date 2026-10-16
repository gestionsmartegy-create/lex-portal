import { describe, expect, it } from "vitest";
import { formatZoned, offsetMinutes, utcToZonedInput, zonedToUtc } from "@/lib/zoned-time";

describe("heures dans le fuseau du tribunal", () => {
  it("convertit une heure locale en UTC, été et hiver, Atlantique et Est", () => {
    expect(zonedToUtc("2026-07-15T09:30", "America/Halifax")).toBe("2026-07-15T12:30:00.000Z"); // ADT -3
    expect(zonedToUtc("2026-12-15T09:30", "America/Halifax")).toBe("2026-12-15T13:30:00.000Z"); // AST -4
    expect(zonedToUtc("2026-07-15T09:30", "America/Toronto")).toBe("2026-07-15T13:30:00.000Z"); // EDT -4
    expect(zonedToUtc("2026-12-15T09:30", "America/Toronto")).toBe("2026-12-15T14:30:00.000Z"); // EST -5
    expect(zonedToUtc("2026-12-15T09:30", "America/St_Johns")).toBe("2026-12-15T13:00:00.000Z"); // NST -3:30
  });

  it("aller-retour exact, y compris autour des changements d'heure", () => {
    for (const [local, tz] of [
      ["2026-03-07T23:00", "America/Toronto"],
      ["2026-03-08T03:00", "America/Toronto"],
      ["2026-11-01T00:30", "America/Halifax"],
      ["2026-11-02T09:00", "America/Halifax"],
    ] as const) {
      expect(utcToZonedInput(zonedToUtc(local, tz)!, tz)).toBe(local);
    }
  });

  it("heure inexistante (saut du printemps) : avancée d'une heure ; heure ambiguë : première occurrence", () => {
    // 8 mars 2026, 2 h 30 n'existe pas à Toronto.
    expect(utcToZonedInput(zonedToUtc("2026-03-08T02:30", "America/Toronto")!, "America/Toronto")).toBe(
      "2026-03-08T03:30",
    );
    // 1er novembre 2026, 1 h 30 existe deux fois à Toronto : la première (EDT, -4).
    expect(zonedToUtc("2026-11-01T01:30", "America/Toronto")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("refuse une saisie mal formée ou impossible", () => {
    for (const bad of ["", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01 10:00", "x"]) {
      expect(zonedToUtc(bad, "America/Halifax")).toBeNull();
    }
  });

  it("décalage et affichage avec l'abréviation du fuseau", () => {
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/Halifax")).toBe(-180);
    expect(formatZoned("2026-12-15T14:30:00.000Z", "America/Toronto", "en")).toMatch(/9:30/);
    expect(formatZoned("2026-12-15T14:30:00.000Z", "America/Toronto", "en")).toMatch(/EST/);
  });
});
