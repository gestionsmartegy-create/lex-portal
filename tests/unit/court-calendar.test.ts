import { describe, expect, it, vi } from "vitest";

// Le module importe la session et Supabase ; seules les fonctions pures sont testées ici.
vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/db/service-client", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/server/providers", () => ({ getClioGateway: vi.fn() }));

const { calendarFiltersSchema, daysOf, markConflicts, periodOf } =
  await import("@/server/services/court-calendar");

const base = { allDay: false, status: "confirmed" as const, courtId: "A", attendeeIds: ["avocat-1"] };

describe("calendrier de cour : périodes", () => {
  it("mois complété aux semaines (dimanche → samedi)", () => {
    // Décembre 2026 : 1er = mardi, 31 = jeudi.
    const p = periodOf("month", "2026-12-15");
    expect(p.start).toBe("2026-11-29");
    expect(p.end).toBe("2027-01-02");
    expect(p.prev).toBe("2026-11-01");
    expect(p.next).toBe("2027-01-01");
    expect(daysOf(p.start, p.end)).toHaveLength(35);
  });

  it("semaine du dimanche au samedi, et liste de 30 jours", () => {
    expect(periodOf("week", "2026-12-16")).toMatchObject({ start: "2026-12-13", end: "2026-12-19" });
    expect(periodOf("list", "2026-12-16")).toMatchObject({ start: "2026-12-16", end: "2027-01-14" });
  });
});

describe("calendrier de cour : conflits d'horaire", () => {
  it("chevauchement d'un même avocat : conflit", () => {
    const c = markConflicts([
      { ...base, id: "1", startsAt: "2026-12-15T14:00:00Z", endsAt: "2026-12-15T16:00:00Z" },
      { ...base, id: "2", startsAt: "2026-12-15T15:00:00Z", endsAt: null },
    ]);
    expect([...c].sort()).toEqual(["1", "2"]);
  });

  it("moins d'une heure entre deux tribunaux différents : conflit ; même tribunal : non", () => {
    const a = { ...base, id: "1", startsAt: "2026-12-15T14:00:00Z", endsAt: "2026-12-15T15:00:00Z" };
    const b = { ...base, id: "2", startsAt: "2026-12-15T15:30:00Z", endsAt: null };
    expect(markConflicts([a, { ...b, courtId: "B" }]).size).toBe(2);
    expect(markConflicts([a, b]).size).toBe(0);
  });

  it("avocats différents, date annulée ou journée entière : pas de conflit", () => {
    const a = { ...base, id: "1", startsAt: "2026-12-15T14:00:00Z", endsAt: "2026-12-15T16:00:00Z" };
    expect(markConflicts([a, { ...a, id: "2", attendeeIds: ["avocat-2"] }]).size).toBe(0);
    expect(markConflicts([a, { ...a, id: "2", status: "cancelled" as never }]).size).toBe(0);
    expect(markConflicts([a, { ...a, id: "2", allDay: true }]).size).toBe(0);
  });
});

describe("calendrier de cour : adresse de la page", () => {
  it("date impossible ou hors bornes : on revient à aujourd'hui (pas d'erreur)", () => {
    for (const bad of ["2026-13-45", "2026-02-30", "9999-12-31", "x", "2026-1-1"]) {
      expect(calendarFiltersSchema.parse({ date: bad }).date).toBeUndefined();
    }
    expect(calendarFiltersSchema.parse({ date: "2026-12-15" }).date).toBe("2026-12-15");
  });
});
