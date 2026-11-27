import { describe, expect, it, vi } from "vitest";

// Écriture d'une date de cour dans Clio : les avocats présents sont nommés dans l'entrée.
const createCalendarEntry = vi.fn<(input: unknown) => Promise<string>>(async () => "555");
let attendees: { profiles: { first_name: string | null; last_name: string | null } | null }[] = [];

/** Constructeur de requête minimal : chaque chaîne se résout selon la table et l'opération. */
function query(table: string) {
  let op = "select";
  const result = () => {
    if (table === "court_date_attendees") return { data: attendees, error: null };
    if (table === "court_dates" && op === "claim")
      return {
        data: {
          id: "cd-1",
          matter_id: "m-1",
          kind: "hearing",
          starts_at: "2026-12-04T14:00:00Z",
          ends_at: null,
          all_day: false,
          timezone: "America/Halifax",
          room: null,
          judge: null,
          docket_number: null,
          mode: "in_person",
          virtual_link: null,
          status: "scheduled",
          clio_calendar_entry_id: null,
          matters: { clio_matter_id: "42", display_number: "TES-1" },
          courts: null,
        },
        error: null,
      };
    return { data: null, error: null };
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "eq", "or", "select", "in"])
    chain[m] = (arg?: unknown) => {
      if (m === "update" && (arg as { clio_sync_status?: string })?.clio_sync_status === "syncing")
        op = "claim";
      return chain;
    };
  chain.maybeSingle = async () => result();
  chain.then = (resolve: (v: unknown) => void) => resolve(result());
  return chain;
}

vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/db/service-client", () => ({
  createSupabaseServiceClient: () => ({
    from: query,
    rpc: async () => ({ data: "777", error: null }),
  }),
}));
vi.mock("@/server/providers", () => ({
  getClioGateway: () => ({ createCalendarEntry, updateCalendarEntry: vi.fn(), deleteCalendarEntry: vi.fn() }),
}));
vi.mock("@/server/services/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/server/services/client-notifier", () => ({ notifyCourtDateChange: vi.fn() }));
vi.mock("@/server/services/matter-tracking", () => ({ assertStaffMatterAccess: vi.fn() }));

const { attendeeNames, syncCourtDateToClio } = await import("@/server/services/court-dates");

describe("présents dans l'entrée Clio", () => {
  it("noms triés ; titre limité à deux noms puis « +n »", () => {
    const people = [
      { first_name: "Zoé", last_name: "Roy" },
      { first_name: "Amélie", last_name: "Côté" },
      { first_name: "Marc", last_name: "Bélanger" },
    ];
    expect(attendeeNames(people)).toEqual({
      full: "Amélie Côté, Marc Bélanger, Zoé Roy",
      short: "Amélie Côté, Marc Bélanger +1",
    });
    expect(attendeeNames([people[0]!])).toEqual({ full: "Zoé Roy", short: "Zoé Roy" });
  });

  it("profil absent ou vide ignoré ; caractères de contrôle retirés", () => {
    expect(attendeeNames([null, { first_name: null, last_name: null }])).toEqual({ full: "", short: "" });
    expect(attendeeNames([{ first_name: "Ana\n", last_name: "Lee\t" }]).full).toBe("Ana Lee");
  });

  it("l'entrée Clio nomme les présents dans le titre et la description", async () => {
    attendees = [{ profiles: { first_name: "Sarah", last_name: "Tremblay" } }];
    expect(await syncCourtDateToClio("cd-1")).toBe("synced");
    const input = createCalendarEntry.mock.calls.at(-1)![0] as unknown as {
      summary: string;
      description: string;
      calendarId: number;
      matterId: number;
    };
    expect(input.summary).toBe("[Cour] Audience / Hearing — TES-1 — Sarah Tremblay");
    expect(input.description).toContain("Présents / Attending: Sarah Tremblay");
    expect(input).toMatchObject({ calendarId: 777, matterId: 42 });
  });

  it("sans présent : titre et description inchangés", async () => {
    attendees = [];
    await syncCourtDateToClio("cd-1");
    const input = createCalendarEntry.mock.calls.at(-1)![0] as unknown as {
      summary: string;
      description: string;
    };
    expect(input.summary).toBe("[Cour] Audience / Hearing — TES-1");
    expect(input.description).not.toContain("Présents");
  });
});
