import { beforeAll, describe, expect, it } from "vitest";
import { ClioManageClient } from "@/server/providers/clio/client";
import { ClioError } from "@/server/providers/clio/gateway";
import type { StoredTokens } from "@/server/providers/clio/schemas";
import type { OAuthTokenStore } from "@/server/providers/tokens/vault-store";
import { decodeOAuthState, encodeOAuthState, sameState } from "@/server/security/oauth-state";
import { mapBill, mapMatter } from "@/server/services/sync";

beforeAll(() => {
  // Valeurs factices (aucun secret) : serverEnv() les exige pour le rafraîchissement du jeton.
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    CLIO_CLIENT_ID: "test-client",
    CLIO_CLIENT_SECRET: "test-secret",
  });
});

class MemoryStore implements OAuthTokenStore {
  saved: StoredTokens[] = [];
  constructor(public tokens: StoredTokens | null) {}
  async get() {
    return this.tokens;
  }
  async save(t: StoredTokens) {
    this.tokens = t;
    this.saved.push(t);
  }
  async report() {}
  async disconnect() {
    this.tokens = null;
  }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function fakeFetch(routes: ((url: URL, init?: RequestInit) => Response | undefined)[]) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    for (const r of routes) {
      const res = r(url, init);
      if (res) return res;
    }
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};
const token = (over: Partial<StoredTokens> = {}): StoredTokens => ({
  access_token: "acc",
  refresh_token: "ref",
  ...over,
});

describe("ClioManageClient (ADR 0014)", () => {
  it("région CA, jeton Bearer, champs demandés, pagination suivie sur le même hôte uniquement", async () => {
    const { impl, calls } = fakeFetch([
      (u) =>
        u.pathname === "/api/v4/matters.json" && !u.searchParams.get("page_token")
          ? json({
              data: [{ id: 1, status: "Open" }],
              meta: { paging: { next: "https://ca.app.clio.com/api/v4/matters.json?page_token=2" } },
            })
          : undefined,
      (u) =>
        u.searchParams.get("page_token") === "2"
          ? json({
              data: [{ id: 2, status: "Closed" }],
              meta: { paging: { next: "https://evil.example/steal" } },
            })
          : undefined,
    ]);
    const client = new ClioManageClient(new MemoryStore(token()), impl, noSleep);
    const matters = await client.listMattersForClient(42);
    expect(matters.map((m) => m.id)).toEqual([1, 2]);
    expect(calls).toHaveLength(2); // l'URL « next » d'un autre hôte n'est jamais suivie
    expect(calls[0]!.url.origin).toBe("https://ca.app.clio.com");
    expect(calls[0]!.url.searchParams.get("client_id")).toBe("42");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("200");
    expect(calls[0]!.url.searchParams.get("fields")).toContain("display_number");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer acc");
  });

  it("champ masqué (redacted) traité comme absent", async () => {
    const { impl } = fakeFetch([
      () => json({ data: [{ id: 7, description: { redacted: true }, status: "Open" }] }),
    ]);
    const [m] = await new ClioManageClient(new MemoryStore(token()), impl, noSleep).listMattersForClient(1);
    expect(m!.description).toBeUndefined();
    expect(mapMatter(m!, false).title).toBe("Clio #7");
  });

  it("429 : attend Retry-After puis réessaie ; 401 : jeton révoqué", async () => {
    const waits: number[] = [];
    let n = 0;
    const { impl } = fakeFetch([
      () =>
        n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "3" } }) : json({ data: [] }),
    ]);
    await new ClioManageClient(
      new MemoryStore(token()),
      impl,
      async (ms) => void waits.push(ms),
    ).listBillsForMatter(1);
    expect(waits).toEqual([3000]);

    const { impl: denied } = fakeFetch([() => new Response("", { status: 401 })]);
    await expect(
      new ClioManageClient(new MemoryStore(token()), denied, noSleep).listBillsForMatter(1),
    ).rejects.toEqual(new ClioError("TOKEN_REVOKED"));
  });

  it("réponse invalide refusée ; non connecté refusé", async () => {
    const { impl } = fakeFetch([() => json({ nope: true })]);
    await expect(
      new ClioManageClient(new MemoryStore(token()), impl, noSleep).listBillsForMatter(1),
    ).rejects.toEqual(new ClioError("INVALID_RESPONSE"));
    await expect(
      new ClioManageClient(new MemoryStore(null), impl, noSleep).listBillsForMatter(1),
    ).rejects.toEqual(new ClioError("NOT_CONNECTED"));
  });

  it("jeton proche de l'échéance : rafraîchi et ENREGISTRÉ avant l'appel", async () => {
    const now = 1_800_000_000_000;
    const store = new MemoryStore(token({ expires_at: now + 30_000 }));
    const { impl, calls } = fakeFetch([
      (u) =>
        u.pathname === "/oauth/token"
          ? json({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 })
          : undefined,
      () => json({ data: [] }),
    ]);
    await new ClioManageClient(store, impl, noSleep, () => now).listBillsForMatter(1);
    expect(String(calls[0]!.init?.body)).toContain("grant_type=refresh_token");
    expect(store.saved.at(-1)?.access_token).toBe("new-acc");
    expect(new Headers(calls[1]!.init?.headers).get("authorization")).toBe("Bearer new-acc");
  });

  it("débit borné : au-delà de 45 requêtes par minute, le client attend", async () => {
    let clock = 0;
    const waits: number[] = [];
    const { impl } = fakeFetch([() => json({ data: [] })]);
    const client = new ClioManageClient(
      new MemoryStore(token()),
      impl,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      () => clock,
    );
    for (let i = 0; i < 46; i += 1) await client.listBillsForMatter(i);
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(0);
  });
});

describe("correspondance Clio → portail", () => {
  it("factures : seules celles émises au client ; montants en chaîne ; retard calculé", () => {
    const base = { id: 1, number: "INV-1", issued_at: "2026-09-01", total: 1250, balance: 1250 };
    expect(mapBill({ ...base, state: "draft" }, "m", "2026-10-02")).toBeNull();
    expect(mapBill({ ...base, state: "awaiting_approval" }, "m", "2026-10-02")).toBeNull();
    expect(
      mapBill({ ...base, state: "awaiting_payment", due_at: "2026-10-30" }, "m", "2026-10-02"),
    ).toMatchObject({
      status: "due",
      amount_total: "1250.00",
      balance_due: "1250.00",
    });
    expect(
      mapBill({ ...base, state: "awaiting_payment", due_at: "2026-09-15" }, "m", "2026-10-02")?.status,
    ).toBe("overdue");
    expect(mapBill({ ...base, state: "paid", balance: 0 }, "m", "2026-10-02")?.status).toBe("paid");
  });

  it("statuts de dossier", () => {
    expect(mapMatter({ id: 1, status: "Pending" }, false).status).toBe("on_hold");
    expect(mapMatter({ id: 1, status: "Closed" }, true)).toMatchObject({
      status: "closed",
      is_mock: true,
      clio_matter_id: "1",
    });
  });
});

describe("état OAuth (CSRF)", () => {
  it("aller-retour et comparaison en temps constant", () => {
    const raw = encodeOAuthState({ state: "s".repeat(32), verifier: "v".repeat(43), locale: "fr" });
    expect(decodeOAuthState(raw)?.locale).toBe("fr");
    expect(decodeOAuthState("garbage")).toBeNull();
    expect(decodeOAuthState(undefined)).toBeNull();
    expect(sameState("abc", "abc")).toBe(true);
    expect(sameState("abc", "abd")).toBe(false);
    expect(sameState("abc", "abcd")).toBe(false);
  });
});
