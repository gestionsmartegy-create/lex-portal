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

  it("rafraîchissement concurrent : un échec utilise le jeton neuf enregistré par l'autre processus", async () => {
    const now = 1_800_000_000_000;
    const store = new MemoryStore(token({ expires_at: now + 10_000 }));
    const { impl, calls } = fakeFetch([
      (u) => {
        if (u.pathname !== "/oauth/token") return undefined;
        store.tokens = { access_token: "other-acc", refresh_token: "other-ref", expires_at: now + 3_600_000 };
        return new Response("", { status: 400 }); // refresh token déjà tourné par l'autre processus
      },
      () => json({ data: [] }),
    ]);
    await new ClioManageClient(store, impl, noSleep, () => now).listBillsForMatter(1);
    expect(new Headers(calls.at(-1)!.init?.headers).get("authorization")).toBe("Bearer other-acc");
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

describe("ClioManageClient — dates de cour (calendrier, ADR 0025)", () => {
  const entry = {
    calendarId: 42,
    matterId: 7,
    summary: "[Cour] Audience / Hearing — LC-1",
    description: "Tribunal / Court: X",
    location: "X",
    startAt: "2026-12-15T14:30:00.000Z",
    endAt: "2026-12-15T16:00:00.000Z",
    allDay: false,
  };

  it("crée l'entrée (POST, calendrier et dossier) et renvoie son identifiant", async () => {
    const { impl, calls } = fakeFetch([
      (url, init) =>
        url.pathname === "/api/v4/calendar_entries.json" && init?.method === "POST"
          ? json({ data: { id: 991 } }, { status: 201 })
          : undefined,
    ]);
    const client = new ClioManageClient(new MemoryStore(token()), impl, noSleep);
    expect(await client.createCalendarEntry(entry)).toBe("991");
    const body = JSON.parse(String(calls[0]!.init!.body)) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      calendar_owner: { id: 42 },
      matter: { id: 7 },
      start_at: entry.startAt,
      send_email_notification: false,
    });
  });

  it("ne rejoue jamais une création après une erreur serveur (évite les doublons)", async () => {
    const { impl, calls } = fakeFetch([() => new Response("{}", { status: 502 })]);
    const client = new ClioManageClient(new MemoryStore(token()), impl, noSleep);
    await expect(client.createCalendarEntry(entry)).rejects.toBeInstanceOf(ClioError);
    expect(calls).toHaveLength(1);
  });

  it("met à jour (PATCH) ; entrée disparue de Clio : false", async () => {
    const { impl, calls } = fakeFetch([
      (url, init) =>
        init?.method === "PATCH" && url.pathname.endsWith("/991.json")
          ? json({ data: { id: 991 } })
          : undefined,
      (url, init) => (init?.method === "PATCH" ? new Response("{}", { status: 404 }) : undefined),
    ]);
    const client = new ClioManageClient(new MemoryStore(token()), impl, noSleep);
    expect(await client.updateCalendarEntry("991", entry)).toBe(true);
    expect(await client.updateCalendarEntry("992", entry)).toBe(false);
    expect(calls.map((c) => c.init?.method)).toEqual(["PATCH", "PATCH"]);
  });

  it("supprime (DELETE, réponse 204) et encode l'identifiant", async () => {
    const { impl, calls } = fakeFetch([
      (_url, init) => (init?.method === "DELETE" ? new Response(null, { status: 204 }) : undefined),
    ]);
    const client = new ClioManageClient(new MemoryStore(token()), impl, noSleep);
    await client.deleteCalendarEntry("../matters/1");
    expect(calls[0]!.url.pathname).toBe("/api/v4/calendar_entries/..%2Fmatters%2F1.json");
  });
});

describe("Clio : dépôt de document et agenda d'un dossier (ADR 0038)", () => {
  const created = (putUrl: string) =>
    json({
      data: {
        id: 4242,
        latest_document_version: {
          uuid: "u-1",
          put_url: putUrl,
          put_headers: [
            { name: "Content-Type", value: "application/pdf" },
            { name: "x-amz-server-side-encryption", value: "AES256" },
            { name: "Authorization", value: "à ne jamais transmettre" },
          ],
        },
      },
    });

  it("crée le document, envoie le fichier sur l'URL S3 signée (sans jeton Clio), puis termine le dépôt", async () => {
    const { impl, calls } = fakeFetch([
      (url, init) =>
        url.pathname === "/api/v4/documents.json" && init?.method === "POST"
          ? created("https://bucket.s3.amazonaws.com/x?sig=1")
          : undefined,
      (url, init) =>
        url.hostname === "bucket.s3.amazonaws.com" && init?.method === "PUT"
          ? new Response(null, { status: 200 })
          : undefined,
      (url, init) =>
        url.pathname === "/api/v4/documents/4242.json" && init?.method === "PATCH"
          ? json({ data: { id: 4242 } })
          : undefined,
    ]);
    const id = await new ClioManageClient(new MemoryStore(token()), impl, noSleep).uploadDocument({
      matterId: 77,
      previousDocumentId: null,
      name: "Mandat - v1.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
    });
    expect(id).toBe(4242);
    const post = JSON.parse(String(calls[0]!.init!.body));
    expect(post.data.parent).toEqual({ id: 77, type: "Matter" });
    const put = calls[1]!;
    const headers = put.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-amz-server-side-encryption"]).toBe("AES256");
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual({ data: { uuid: "u-1", fully_uploaded: true } });
  });

  it("nouvelle version : le parent est le document précédent", async () => {
    const { impl, calls } = fakeFetch([
      (url, init) => (init?.method === "POST" ? created("https://bucket.s3.amazonaws.com/x") : undefined),
      (_url, init) => (init?.method === "PUT" ? new Response(null, { status: 200 }) : undefined),
      (_url, init) => (init?.method === "PATCH" ? json({ data: { id: 4242 } }) : undefined),
    ]);
    await new ClioManageClient(new MemoryStore(token()), impl, noSleep).uploadDocument({
      matterId: 77,
      previousDocumentId: 999,
      name: "Mandat - v2.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([1]),
    });
    expect(JSON.parse(String(calls[0]!.init!.body)).data.parent).toEqual({ id: 999, type: "Document" });
  });

  it("refuse une URL d'envoi qui n'est pas S3 en https (aucun fichier envoyé ailleurs)", async () => {
    const { impl, calls } = fakeFetch([
      (_url, init) => (init?.method === "POST" ? created("https://evil.example.com/upload") : undefined),
    ]);
    await expect(
      new ClioManageClient(new MemoryStore(token()), impl, noSleep).uploadDocument({
        matterId: 77,
        previousDocumentId: null,
        name: "x.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toEqual(new ClioError("INVALID_RESPONSE"));
    expect(calls).toHaveLength(1);
  });

  it("refuse un hôte AWS qui n'est pas S3, un port explicite, et échoue si la fin du dépôt est introuvable", async () => {
    for (const url of [
      "https://ec2-1-2-3-4.compute.amazonaws.com/x",
      "https://bucket.s3.amazonaws.com:8443/x",
    ]) {
      const { impl, calls } = fakeFetch([(_u, init) => (init?.method === "POST" ? created(url) : undefined)]);
      await expect(
        new ClioManageClient(new MemoryStore(token()), impl, noSleep).uploadDocument({
          matterId: 1,
          previousDocumentId: null,
          name: "x.pdf",
          contentType: "application/pdf",
          bytes: new Uint8Array([1]),
        }),
      ).rejects.toEqual(new ClioError("INVALID_RESPONSE"));
      expect(calls).toHaveLength(1);
    }
    const { impl } = fakeFetch([
      (_u, init) =>
        init?.method === "POST" ? created("https://bucket.s3.ca-central-1.amazonaws.com/x") : undefined,
      (_u, init) => (init?.method === "PUT" ? new Response(null, { status: 200 }) : undefined),
      (_u, init) => (init?.method === "PATCH" ? new Response("{}", { status: 404 }) : undefined),
    ]);
    await expect(
      new ClioManageClient(new MemoryStore(token()), impl, noSleep).uploadDocument({
        matterId: 1,
        previousDocumentId: null,
        name: "x.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toEqual(new ClioError("UPSTREAM"));
  });

  it("lit l'agenda d'un dossier : filtre matter_id, tous les utilisateurs, depuis une date", async () => {
    const { impl, calls } = fakeFetch([
      (url) =>
        url.pathname === "/api/v4/calendar_entries.json"
          ? json({
              data: [
                {
                  id: 5,
                  summary: "Audience",
                  start_at: "2026-12-01T14:00:00Z",
                  end_at: null,
                  all_day: false,
                  calendar_entry_event_type: { name: "Court" },
                },
                { id: 6, summary: "Sans date", start_at: null },
              ],
            })
          : undefined,
    ]);
    const rows = await new ClioManageClient(
      new MemoryStore(token()),
      impl,
      noSleep,
    ).listMatterCalendarEntries(77, "2026-10-01T00:00:00Z");
    expect(rows).toEqual([
      {
        id: "5",
        summary: "Audience",
        location: null,
        startAt: "2026-12-01T14:00:00Z",
        endAt: null,
        allDay: false,
        eventType: "Court",
      },
    ]);
    const q = calls[0]!.url.searchParams;
    expect(q.get("matter_id")).toBe("77");
    expect(q.get("owner_entries_across_all_users")).toBe("true");
    expect(q.get("updated_since")).toBe("2026-10-01T00:00:00Z");
  });
});
