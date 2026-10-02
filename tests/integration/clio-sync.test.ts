import { afterAll, describe, expect, it, vi } from "vitest";
import { serviceClient } from "./helpers";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { importClioContact, syncLinkedMatters } = await import("@/server/services/sync");
const { VaultTokenStore } = await import("@/server/providers/tokens/vault-store");

/** Phase 2 (ADR 0014) : Vault réel et synchronisation contre le faux Clio (mode mock). */
const admin = serviceClient();
const ACTOR = "a0000000-0000-4000-8000-0000000000a1";

afterAll(async () => {
  const { data } = await admin.from("matters").select("id").in("clio_matter_id", ["7700001", "7700002"]);
  const ids = (data ?? []).map((m) => m.id);
  if (ids.length) {
    await admin.from("invoices").delete().in("matter_id", ids);
    await admin.from("matters").delete().in("id", ids);
  }
  await new VaultTokenStore("clio_manage", "ca").disconnect();
});

describe("coffre à jetons (Supabase Vault)", () => {
  it("enregistre, relit, remplace et supprime les jetons", async () => {
    const store = new VaultTokenStore("clio_manage", "ca");
    await store.save({ access_token: "it-a1", refresh_token: "it-r1", expires_at: 1 });
    expect(await store.get()).toEqual({ access_token: "it-a1", refresh_token: "it-r1", expires_at: 1 });
    await store.save({ access_token: "it-a2", refresh_token: "it-r2" });
    expect((await store.get())?.access_token).toBe("it-a2");
    await store.disconnect();
    expect(await store.get()).toBeNull();
  });
});

describe("import et synchronisation (faux Clio)", () => {
  it("importe les dossiers d'UN contact et ses factures émises, sans donner d'accès", async () => {
    const result = await importClioContact("riley.demo@example.com", ACTOR);
    expect(result).toMatchObject({ ok: true, matters: 1, bills: 2 }); // le brouillon n'est jamais importé

    const { data: matter } = await admin
      .from("matters")
      .select("id, display_number, status, is_mock, last_synced_at")
      .eq("clio_matter_id", "7700001")
      .single();
    expect(matter).toMatchObject({ display_number: "LC-2026-0201", status: "open", is_mock: true });
    expect(matter!.last_synced_at).not.toBeNull();

    const { data: invoices } = await admin
      .from("invoices")
      .select("invoice_number, amount_total, status")
      .eq("matter_id", matter!.id);
    expect(invoices?.map((i) => i.invoice_number).sort()).toEqual(["INV-2026-0199", "INV-2026-0201"]);

    const { count } = await admin
      .from("matter_access")
      .select("id", { count: "exact", head: true })
      .eq("matter_id", matter!.id);
    expect(count).toBe(0); // l'import ne donne jamais d'accès

    // Les dossiers d'un autre contact ne sont pas importés.
    const { data: other } = await admin
      .from("matters")
      .select("id")
      .eq("clio_matter_id", "7700002")
      .maybeSingle();
    expect(other).toBeNull();
  });

  it("un second import est idempotent ; la resynchronisation met à jour les dossiers liés", async () => {
    await importClioContact("riley.demo@example.com", ACTOR);
    const { count } = await admin
      .from("matters")
      .select("id", { count: "exact", head: true })
      .eq("clio_matter_id", "7700001");
    expect(count).toBe(1);
    const sync = await syncLinkedMatters(null);
    expect(sync.ok).toBe(true);
    expect(sync.updated).toBeGreaterThanOrEqual(1);
  });

  it("contact introuvable : refus clair, rien d'importé", async () => {
    expect(await importClioContact("nobody@example.com", ACTOR)).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
