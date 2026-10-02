import { describe, expect, it } from "vitest";
import { formatBytes, formatCalendarDate, formatMoney, formatRelative, initials } from "@/lib/format";
import { toIcs } from "@/server/services/appointment";
import { demoPdf } from "@/server/providers/sharepoint/mock";

describe("formatage (AGENTS.md §5)", () => {
  it("montants depuis une chaîne décimale, sans flottant", () => {
    expect(formatMoney("1250.00", "en")).toBe("$1,250.00");
    expect(formatMoney("1250.00", "fr").replace(/\s/g, " ")).toBe("1 250,00 $");
    // Une valeur qui perdrait sa précision en flottant reste exacte.
    expect(formatMoney("12345678901234.57", "en")).toBe("$12,345,678,901,234.57");
  });

  it("date de calendrier sans décalage de fuseau", () => {
    expect(formatCalendarDate("2026-10-05", "en")).toBe("Oct 5, 2026");
  });

  it("temps relatif et tailles", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(formatRelative("2026-10-02T11:55:00Z", "en", now)).toMatch(/^5 min/);
    expect(formatBytes(1258291, "en")).toBe("1.2 MB");
    expect(formatBytes(null, "en")).toBe("—");
    expect(initials("John", "Doe")).toBe("JD");
    expect(initials(null, null, "LC")).toBe("LC");
  });
});

describe("rendez-vous .ics et PDF de démonstration", () => {
  it("ics conforme, champs échappés", () => {
    const ics = toIcs(
      {
        id: "a1",
        matter_id: "m",
        title: "Consultation; suivi",
        description: null,
        starts_at: "2026-10-11T17:00:00Z",
        ends_at: null,
        timezone: "America/Halifax",
        location: "Teams, salle 2",
        meeting_url: null,
        with_staff_name: null,
        status: "scheduled",
        matters: null,
      },
      new Date("2026-10-02T00:00:00Z"),
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261011T170000Z");
    expect(ics).toContain("DTEND:20261011T180000Z");
    expect(ics).toContain("SUMMARY:Consultation\; suivi — Lex Canada Law");
    expect(ics).toContain("LOCATION:Teams\\, salle 2");
  });

  it("le PDF fictif est un PDF valide qui le dit", () => {
    const text = new TextDecoder().decode(demoPdf("Contrat (v2).pdf"));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Demo document");
    expect(text).toContain("Contrat \\(v2\\).pdf");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
