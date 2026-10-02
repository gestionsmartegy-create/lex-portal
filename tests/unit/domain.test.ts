import { describe, expect, it } from "vitest";
import { canWrite, enumValues, isAccessActive, isStale, isVisibleToClient } from "@/types/domain";

// Les règles pures doivent refléter exactement les politiques RLS (docs/database.md §5).
describe("types métier", () => {
  it("les énumérations attendues par le code existent dans le schéma", () => {
    expect(enumValues.document_folder).toEqual(["shared", "client_upload", "signed", "internal"]);
    expect(enumValues.app_role).toEqual(["client", "staff", "firm_admin"]);
    expect(enumValues.access_level).toEqual(["read", "read_write"]);
    expect(enumValues.notification_priority).toEqual(["urgent", "info", "success"]);
  });

  it("un accès révoqué n'est ni actif ni inscriptible", () => {
    const revoked = { revoked_at: "2026-10-01T00:00:00Z", access_level: "read_write" as const };
    expect(isAccessActive(revoked)).toBe(false);
    expect(canWrite(revoked)).toBe(false);
    expect(canWrite({ revoked_at: null, access_level: "read" })).toBe(false);
    expect(canWrite({ revoked_at: null, access_level: "read_write" })).toBe(true);
  });

  it("visibilité d'un document : même règle que la RLS", () => {
    const base = { scan_status: "clean" as const, deleted_at: null };
    expect(isVisibleToClient({ ...base, folder: "shared" })).toBe(true);
    expect(isVisibleToClient({ ...base, folder: "internal" })).toBe(false);
    expect(isVisibleToClient({ ...base, folder: "shared", scan_status: "infected" })).toBe(false);
    expect(isVisibleToClient({ ...base, folder: "shared", scan_status: "pending" })).toBe(false);
    expect(isVisibleToClient({ ...base, folder: "signed", deleted_at: "2026-10-01T00:00:00Z" })).toBe(false);
  });

  it("fraîcheur des données de cache", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(isStale(null, 1000, now)).toBe(true);
    expect(isStale("2026-10-01T11:59:00Z", 5 * 60_000, now)).toBe(false);
    expect(isStale("2026-09-30T11:00:00Z", 24 * 3_600_000, now)).toBe(true);
  });
});
