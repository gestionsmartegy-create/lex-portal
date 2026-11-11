import { beforeAll, describe, expect, it } from "vitest";
import { GraphOutlookCalendarGateway, type OutlookTokenStore } from "@/server/providers/outlook/client";
import { OutlookError } from "@/server/providers/outlook/gateway";
import {
  canWriteReminders,
  decodeOutlookState,
  encodeOutlookState,
  exchangeOutlookCode,
  fetchOutlookAccount,
  outlookAuthorizeUrl,
  outlookScopes,
} from "@/server/providers/outlook/oauth";
import type { OutlookTokens } from "@/server/providers/outlook/schemas";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const USER = "00000000-0000-0000-0000-00000000000b";

beforeAll(() => {
  // Valeurs factices (aucun secret) : serverEnv() les exige pour le point de jetons.
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    APP_BASE_URL: "https://portail.test",
    OUTLOOK_TENANT_ID: TENANT,
    OUTLOOK_CLIENT_ID: CLIENT,
    OUTLOOK_CLIENT_SECRET: "test-secret",
  });
});

class MemoryStore implements OutlookTokenStore {
  updates: OutlookTokens[] = [];
  constructor(public tokens: OutlookTokens | null) {}
  async get() {
    return this.tokens;
  }
  async update(_userId: string, t: OutlookTokens) {
    this.tokens = t;
    this.updates.push(t);
  }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

type Call = { url: string; method: string; auth: string | null; body: string | null };

/** Faux Microsoft : répond selon l'URL et garde la trace des appels. */
function fakeFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = init?.body;
    const call: Call = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      body: body === undefined || body === null ? null : body.toString(),
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { impl, calls };
}

const fresh = (): OutlookTokens => ({
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_at: Date.now() + 3_600_000,
  scope: "User.Read Calendars.ReadBasic",
});

describe("connexion Microsoft (OAuth)", () => {
  it("construit l'adresse d'autorisation du locataire du cabinet, avec PKCE et choix du compte", () => {
    const url = new URL(outlookAuthorizeUrl("s".repeat(24), "challenge", outlookScopes(false)));
    expect(url.origin + url.pathname).toBe(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
    );
    expect(url.searchParams.get("client_id")).toBe(CLIENT);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://portail.test/api/integrations/outlook/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("scope")).toBe("User.Read offline_access Calendars.ReadBasic");
  });

  it("ne demande l'écriture que pour les rappels, et jamais l'accès aux courriels", () => {
    expect(outlookScopes(false)).not.toContain("Calendars.ReadWrite");
    expect(outlookScopes(true)).toContain("Calendars.ReadWrite");
    expect(outlookScopes(true).join(" ")).not.toMatch(/mail/i);
  });

  it("reconnaît la permission d'écriture dans la réponse de Microsoft", () => {
    expect(canWriteReminders("User.Read Calendars.ReadBasic")).toBe(false);
    expect(canWriteReminders("https://graph.microsoft.com/Calendars.ReadWrite User.Read")).toBe(true);
    expect(canWriteReminders(undefined)).toBe(false);
  });

  it("refuse un état de connexion abîmé", () => {
    const good = encodeOutlookState({
      state: "s".repeat(24),
      verifier: "v".repeat(43),
      locale: "fr",
      reminders: true,
      userId: "33333333-3333-4333-8333-333333333333",
    });
    expect(decodeOutlookState(good)?.reminders).toBe(true);
    expect(decodeOutlookState("pas-du-json")).toBeNull();
    expect(decodeOutlookState(undefined)).toBeNull();
    expect(
      decodeOutlookState(Buffer.from(JSON.stringify({ state: "court" })).toString("base64url")),
    ).toBeNull();
  });

  it("échange le code avec le vérificateur PKCE, sans suivre de redirection", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "User.Read" }),
    );
    const tokens = await exchangeOutlookCode("code-1", "v".repeat(43), impl);
    expect(tokens.access_token).toBe("a");
    expect(tokens.expires_at).toBeGreaterThan(Date.now());
    expect(calls[0]?.url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`);
    expect(calls[0]?.body).toContain("code_verifier=");
    expect(calls[0]?.body).toContain("grant_type=authorization_code");
  });

  it("traduit un code refusé en erreur interne, sans rien relayer de Microsoft", async () => {
    const { impl } = fakeFetch(() =>
      json({ error: "invalid_grant", error_description: "détail" }, { status: 400 }),
    );
    await expect(exchangeOutlookCode("code-1", "v".repeat(43), impl)).rejects.toMatchObject({
      code: "TOKEN_REVOKED",
      message: "TOKEN_REVOKED",
    });
  });
});

describe("compte Microsoft connecté", () => {
  it("propose le compte attendu à Microsoft", () => {
    const url = new URL(
      outlookAuthorizeUrl("s".repeat(24), "challenge", outlookScopes(false), "wilson@cabinet.test"),
    );
    expect(url.searchParams.get("login_hint")).toBe("wilson@cabinet.test");
  });

  it("lit les adresses du compte, en minuscules, sans rien d'autre", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ mail: "Wilson@Cabinet.TEST", userPrincipalName: "wilson@CABINET.test", displayName: "ignoré" }),
    );
    expect(await fetchOutlookAccount("access-1", impl)).toEqual([
      "wilson@cabinet.test",
      "wilson@cabinet.test",
    ]);
    expect(calls[0]?.url).toBe("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName");
    expect(calls[0]?.auth).toBe("Bearer access-1");
  });

  it("échoue proprement si Microsoft refuse", async () => {
    const { impl } = fakeFetch(() => json({ error: {} }, { status: 403 }));
    await expect(fetchOutlookAccount("access-1", impl)).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});

describe("client Microsoft Graph des agendas", () => {
  it("lit seulement début, fin et état, et ne garde que les plages occupées", async () => {
    const store = new MemoryStore(fresh());
    const { impl, calls } = fakeFetch(() =>
      json({
        value: [
          {
            start: { dateTime: "2026-11-12T14:00:00.0000000" },
            end: { dateTime: "2026-11-12T15:00:00.0000000" },
            showAs: "busy",
          },
          {
            start: { dateTime: "2026-11-12T16:00:00.0000000" },
            end: { dateTime: "2026-11-12T17:00:00.0000000" },
            showAs: "free",
          },
          {
            start: { dateTime: "2026-11-13T09:00:00.0000000" },
            end: { dateTime: "2026-11-13T10:00:00.0000000" },
            showAs: "oof",
          },
          {
            start: { dateTime: "2026-11-13T11:00:00.0000000" },
            end: { dateTime: "2026-11-13T12:00:00.0000000" },
            showAs: "busy",
            isCancelled: true,
          },
          {
            start: { dateTime: "2026-11-14T11:00:00.0000000" },
            end: { dateTime: "2026-11-14T10:00:00.0000000" },
            showAs: "busy",
          },
        ],
      }),
    );
    const gateway = new GraphOutlookCalendarGateway(store, impl);
    const blocks = await gateway.getBusyBlocks(
      USER,
      new Date("2026-11-10T00:00:00Z"),
      new Date("2026-12-10T00:00:00Z"),
    );
    expect(blocks).toEqual([
      { start: "2026-11-12T14:00:00.000Z", end: "2026-11-12T15:00:00.000Z" },
      { start: "2026-11-13T09:00:00.000Z", end: "2026-11-13T10:00:00.000Z" },
    ]);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://graph.microsoft.com/v1.0/me/calendarView");
    expect(url.searchParams.get("$select")).toBe("start,end,showAs,isCancelled");
    expect(calls[0]?.auth).toBe("Bearer access-1");
  });

  it("suit les pages suivantes de Microsoft Graph seulement", async () => {
    const page = (next?: string) =>
      json({
        value: [
          {
            start: { dateTime: "2026-11-12T14:00:00" },
            end: { dateTime: "2026-11-12T15:00:00" },
            showAs: "busy",
          },
        ],
        ...(next ? { "@odata.nextLink": next } : {}),
      });
    const ok = fakeFetch((call) =>
      call.url.includes("skip=1") ? page() : page("https://graph.microsoft.com/v1.0/me/calendarView?skip=1"),
    );
    const blocks = await new GraphOutlookCalendarGateway(new MemoryStore(fresh()), ok.impl).getBusyBlocks(
      USER,
      new Date("2026-11-10T00:00:00Z"),
      new Date("2026-12-10T00:00:00Z"),
    );
    expect(blocks).toHaveLength(2);

    // Un lien de page suivante vers un autre hôte : le jeton n'y est jamais envoyé.
    const evil = fakeFetch(() => page("https://exemple.invalid/v1.0/me/calendarView?skip=1"));
    await expect(
      new GraphOutlookCalendarGateway(new MemoryStore(fresh()), evil.impl).getBusyBlocks(
        USER,
        new Date("2026-11-10T00:00:00Z"),
        new Date("2026-12-10T00:00:00Z"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(evil.calls).toHaveLength(1);
  });

  it("renouvelle un jeton arrivé à échéance et enregistre le nouveau", async () => {
    const store = new MemoryStore({ ...fresh(), expires_at: Date.now() - 1000 });
    const { impl, calls } = fakeFetch((call) =>
      call.url.includes("/oauth2/v2.0/token")
        ? json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 })
        : json({ value: [] }),
    );
    await new GraphOutlookCalendarGateway(store, impl).getBusyBlocks(
      USER,
      new Date(),
      new Date(Date.now() + 86_400_000),
    );
    expect(store.updates).toHaveLength(1);
    expect(store.tokens?.refresh_token).toBe("refresh-2");
    // Les permissions de la connexion sont conservées quand Microsoft ne les renvoie pas.
    expect(store.tokens?.scope).toBe("User.Read Calendars.ReadBasic");
    expect(calls.at(-1)?.auth).toBe("Bearer access-2");
  });

  it("signale « à reconnecter » quand Microsoft a retiré l'accès", async () => {
    const store = new MemoryStore({ ...fresh(), expires_at: Date.now() - 1000 });
    const { impl } = fakeFetch(() => json({ error: "invalid_grant" }, { status: 400 }));
    await expect(
      new GraphOutlookCalendarGateway(store, impl).getBusyBlocks(
        USER,
        new Date(),
        new Date(Date.now() + 86_400_000),
      ),
    ).rejects.toMatchObject({ code: "TOKEN_REVOKED" });

    const none = new GraphOutlookCalendarGateway(new MemoryStore(null), fakeFetch(() => json({})).impl);
    await expect(
      none.getBusyBlocks(USER, new Date(), new Date(Date.now() + 86_400_000)),
    ).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    });
  });

  it("traduit la limite de débit et les pannes en codes internes", async () => {
    const run = (status: number) =>
      new GraphOutlookCalendarGateway(
        new MemoryStore(fresh()),
        fakeFetch(() => json({ error: { message: "détail interne de Microsoft" } }, { status })).impl,
      ).getBusyBlocks(USER, new Date(), new Date(Date.now() + 86_400_000));
    await expect(run(429)).rejects.toMatchObject({ code: "RATE_LIMITED", message: "RATE_LIMITED" });
    await expect(run(500)).rejects.toMatchObject({ code: "UPSTREAM", message: "UPSTREAM" });
    await expect(run(429)).rejects.toBeInstanceOf(OutlookError);
  });

  it("retrouve l'agenda « Lex Portail » avant d'en créer un", async () => {
    const found = fakeFetch(() =>
      json({
        value: [
          { id: "cal-autre", name: "Calendrier" },
          { id: "cal-lex", name: "Lex Portail" },
        ],
      }),
    );
    const gateway = new GraphOutlookCalendarGateway(new MemoryStore(fresh()), found.impl);
    expect(await gateway.ensureReminderCalendar(USER, null)).toBe("cal-lex");
    expect(found.calls.every((c) => c.method === "GET")).toBe(true);

    const created = fakeFetch((call) =>
      call.method === "POST" ? json({ id: "cal-neuf" }, { status: 201 }) : json({ value: [] }),
    );
    expect(
      await new GraphOutlookCalendarGateway(new MemoryStore(fresh()), created.impl).ensureReminderCalendar(
        USER,
        null,
      ),
    ).toBe("cal-neuf");
    expect(created.calls.at(-1)?.body).toBe(JSON.stringify({ name: "Lex Portail" }));
  });

  it("écrit un rappel « disponible », sans participant, puis le met à jour ou le recrée", async () => {
    const input = {
      subject: "Préparation J-7 — Audience — LC-2026-0142",
      startAt: "2026-11-20T13:00:00.000Z",
      endAt: "2026-11-20T13:30:00.000Z",
      timeZone: "America/Halifax",
    };
    const post = fakeFetch(() => json({ id: "evt-1" }, { status: 201 }));
    const gateway = new GraphOutlookCalendarGateway(new MemoryStore(fresh()), post.impl);
    expect(await gateway.upsertReminder(USER, "cal/lex", null, input)).toBe("evt-1");
    expect(post.calls[0]?.url).toBe("https://graph.microsoft.com/v1.0/me/calendars/cal%2Flex/events");
    const body = JSON.parse(post.calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.showAs).toBe("free");
    expect(body.start).toEqual({ dateTime: "2026-11-20T13:00:00.000", timeZone: "UTC" });
    expect(body).not.toHaveProperty("attendees");
    expect(body).not.toHaveProperty("body");

    const patch = fakeFetch(() => json({ id: "evt-1" }));
    expect(
      await new GraphOutlookCalendarGateway(new MemoryStore(fresh()), patch.impl).upsertReminder(
        USER,
        "cal",
        "evt-1",
        input,
      ),
    ).toBe("evt-1");
    expect(patch.calls[0]?.method).toBe("PATCH");

    // Rappel supprimé à la main dans Outlook : il est recréé.
    const gone = fakeFetch((call) =>
      call.method === "PATCH" ? json({}, { status: 404 }) : json({ id: "evt-2" }, { status: 201 }),
    );
    expect(
      await new GraphOutlookCalendarGateway(new MemoryStore(fresh()), gone.impl).upsertReminder(
        USER,
        "cal",
        "evt-1",
        input,
      ),
    ).toBe("evt-2");
  });

  it("retire un rappel, même déjà absent", async () => {
    const del = fakeFetch(() => new Response(null, { status: 204 }));
    await new GraphOutlookCalendarGateway(new MemoryStore(fresh()), del.impl).deleteReminder(USER, "evt-1");
    expect(del.calls[0]?.method).toBe("DELETE");
    const absent = fakeFetch(() => json({}, { status: 404 }));
    await expect(
      new GraphOutlookCalendarGateway(new MemoryStore(fresh()), absent.impl).deleteReminder(USER, "evt-1"),
    ).resolves.toBeUndefined();
  });
});
