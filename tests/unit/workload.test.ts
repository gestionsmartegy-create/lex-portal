import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/db/service-client", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/server/providers", () => ({ getClioGateway: vi.fn() }));

const { aggregateWorkload } = await import("@/server/services/workload");

const court = (id: string, matter: string, start: string, attendees: string[], over = {}) => ({
  id,
  matter_id: matter,
  court_id: "C1",
  starts_at: start,
  ends_at: null,
  all_day: false,
  status: "confirmed" as const,
  court_date_attendees: attendees.map((user_id) => ({ user_id })),
  ...over,
});

const base = {
  staff: [
    { id: "A", name: "Avocate A", primaryOfficeId: "HFX" },
    { id: "B", name: "Avocat B", primaryOfficeId: "OTT" },
    { id: "Z", name: "Sans dossier", primaryOfficeId: null },
  ],
  matters: [
    { id: "M1", office_id: "HFX", matter_type_id: "IMM" },
    { id: "M2", office_id: "HFX", matter_type_id: "IMM" },
    { id: "M3", office_id: "OTT", matter_type_id: "FAM" },
  ],
  team: [
    { matter_id: "M1", user_id: "A", role: "responsible" },
    { matter_id: "M2", user_id: "A", role: "collaborator" },
    { matter_id: "M3", user_id: "B", role: "responsible" },
  ],
  courtDates: [
    court("D1", "M1", "2026-12-15T14:00:00Z", ["A"]),
    court("D2", "M2", "2026-12-15T14:30:00Z", ["A"]),
    court("D3", "M3", "2026-12-16T14:00:00Z", ["B"]),
    court("D4", "M3", "2026-12-17T14:00:00Z", ["B"], { status: "cancelled" }),
  ],
  deliverables: [{ matter_id: "M1", owner_id: "A" }],
};

describe("charge de travail", () => {
  it("par avocat : dossiers, responsable, dates de cour, conflits, livrables ; dates annulées exclues", () => {
    const r = aggregateWorkload(base);
    expect(r.lawyers.map((l) => l.id)).toEqual(["A", "B"]); // « Sans dossier » masqué
    expect(r.lawyers[0]).toMatchObject({
      openMatters: 2,
      responsibleMatters: 1,
      courtDates: 2,
      conflicts: 2,
      deliverables: 1,
    });
    expect(r.lawyers[1]).toMatchObject({ openMatters: 1, courtDates: 1, conflicts: 0 });
    expect(r.totals).toEqual({ matters: 3, courtDates: 3, conflicts: 2 });
  });

  it("par bureau, tribunal et domaine ; filtre par bureau", () => {
    const r = aggregateWorkload(base);
    expect(r.offices).toEqual([
      { id: "HFX", count: 2, courtDates: 2 },
      { id: "OTT", count: 1, courtDates: 1 },
    ]);
    expect(r.byCourt).toEqual([{ id: "C1", count: 3 }]);
    expect(r.byType).toEqual([
      { id: "IMM", count: 2 },
      { id: "FAM", count: 1 },
    ]);
    const ottawa = aggregateWorkload({ ...base, office: "OTT" });
    expect(ottawa.lawyers.map((l) => l.id)).toEqual(["B"]);
    expect(ottawa.totals.matters).toBe(1);
  });
});
