import { describe, expect, it, vi } from "vitest";

// Modules serveur : seules les fonctions pures sont testées ici.
vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/db/service-client", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/server/providers", () => ({ getClioGateway: vi.fn() }));
vi.mock("@/server/services/matter-tracking", () => ({ assertStaffMatterAccess: vi.fn() }));
vi.mock("@/server/services/audit", () => ({ recordAudit: vi.fn() }));

const { mockBusyBlocks, MockOutlookCalendarGateway } = await import("@/server/providers/outlook/mock");
const { clioChangeOf } = await import("@/server/services/court-dates");
const { MockClioManageGateway } = await import("@/server/providers/clio/mock");

describe("simulateur Outlook (ADR 0031)", () => {
  const from = new Date("2026-11-01T00:00:00Z"); // dimanche
  const to = new Date("2026-11-08T00:00:00Z");

  it("plages occupées en semaine seulement, stables d'un appel à l'autre", () => {
    const a = mockBusyBlocks("user-a", from, to);
    expect(a).toHaveLength(5);
    expect(mockBusyBlocks("user-a", from, to)).toEqual(a);
    for (const b of a) {
      expect(Object.keys(b).sort()).toEqual(["end", "start"]); // jamais de titre ni de lieu
      const day = new Date(b.start).getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
      expect(Date.parse(b.end)).toBeGreaterThan(Date.parse(b.start));
    }
  });

  it("lundi 9 h à Halifax (heure normale, UTC-4) au plus tôt, décalé selon la personne", () => {
    const monday = mockBusyBlocks("user-a", from, to)[0]!;
    const minutes = new Date(monday.start).getUTCHours() * 60 + new Date(monday.start).getUTCMinutes();
    expect([13 * 60, 13 * 60 + 30, 14 * 60]).toContain(minutes);
  });

  it("rappels : création puis mise à jour du même événement", async () => {
    const g = new MockOutlookCalendarGateway();
    const cal = await g.ensureReminderCalendar("user-a", null);
    const input = {
      subject: "Préparation",
      startAt: from.toISOString(),
      endAt: to.toISOString(),
      timeZone: "UTC",
    };
    const id = await g.upsertReminder("user-a", cal, null, input);
    expect(await g.upsertReminder("user-a", cal, id, input)).toBe(id);
    await g.deleteReminder("user-a", id);
    expect(await g.upsertReminder("user-a", cal, id, input)).not.toBe(id);
  });
});

describe("retour depuis Clio (E16)", () => {
  const cd = { starts_at: "2026-11-20T13:30:00Z", ends_at: "2026-11-20T15:00:00Z", all_day: false };

  it("même heure (format Clio avec décalage) : aucun changement", () => {
    expect(
      clioChangeOf(cd, {
        state: "found",
        startAt: "2026-11-20T09:30:00-04:00",
        endAt: "2026-11-20T11:00:00-04:00",
        allDay: false,
      }),
    ).toBeNull();
  });

  it("heure déplacée : nouvelle heure ; entrée supprimée : annulée", () => {
    expect(
      clioChangeOf(cd, {
        state: "found",
        startAt: "2026-11-21T13:30:00Z",
        endAt: "2026-11-21T15:00:00Z",
        allDay: false,
      }),
    ).toEqual({ kind: "moved", startAt: "2026-11-21T13:30:00.000Z", endAt: "2026-11-21T15:00:00.000Z" });
    expect(clioChangeOf(cd, { state: "gone" })).toEqual({ kind: "deleted" });
  });

  it("inconnue (simulateur redémarré) ou journée entière : jamais signalée", () => {
    expect(clioChangeOf(cd, { state: "unknown" })).toBeNull();
    expect(
      clioChangeOf(
        { ...cd, all_day: true },
        { state: "found", startAt: "2026-11-22", endAt: null, allDay: true },
      ),
    ).toBeNull();
  });

  it("faux Clio : une entrée retirée est « gone », une entrée inconnue « unknown »", async () => {
    const clio = new MockClioManageGateway();
    const input = {
      calendarId: 1,
      matterId: null,
      summary: "x",
      description: "",
      location: "",
      startAt: cd.starts_at,
      endAt: cd.ends_at,
      allDay: false,
    };
    const id = await clio.createCalendarEntry(input);
    expect(await clio.getCalendarEntry(id)).toMatchObject({ state: "found", startAt: cd.starts_at });
    await clio.deleteCalendarEntry(id);
    expect(await clio.getCalendarEntry(id)).toEqual({ state: "gone" });
    expect(await clio.getCalendarEntry("mock-inconnu")).toEqual({ state: "unknown" });
  });
});
