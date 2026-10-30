import { describe, expect, it } from "vitest";
import { courtKindOf, isCourtEvent } from "@/server/services/clio-agenda";

describe("Dates de cour venues de Clio : reconnaissance (ADR 0038)", () => {
  it("devine la sorte d'après le type ou le titre", () => {
    expect(courtKindOf({ summary: "Audience — Cour suprême", eventType: null })).toBe("hearing");
    expect(courtKindOf({ summary: "Trial day 1", eventType: null })).toBe("trial");
    expect(courtKindOf({ summary: "Présentation", eventType: "Motion" })).toBe("motion");
    expect(courtKindOf({ summary: "Conférence de gestion", eventType: null })).toBe("case_conference");
    expect(courtKindOf({ summary: "Date limite de dépôt", eventType: null })).toBe("filing_deadline");
  });

  it("ignore ce qui n'est pas une date de cour", () => {
    expect(courtKindOf({ summary: "Rencontre avec le client", eventType: "Meeting" })).toBeNull();
    expect(courtKindOf({ summary: "Appel de suivi", eventType: null })).toBeNull();
  });

  it("import automatique : seulement le type d'événement « Cour » / « Court » (décision du 2026-10-28)", () => {
    expect(isCourtEvent({ eventType: "Court" })).toBe(true);
    expect(isCourtEvent({ eventType: "Cour" })).toBe(true);
    expect(isCourtEvent({ eventType: "Court appearance" })).toBe(true);
    expect(isCourtEvent({ eventType: "Meeting" })).toBe(false);
    expect(isCourtEvent({ eventType: null })).toBe(false);
    expect(isCourtEvent({ eventType: "Courtesy call" })).toBe(false);
  });
});
