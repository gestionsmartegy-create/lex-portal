import "server-only";
import type { z } from "zod";
import type { OAuthTokenStore } from "@/server/providers/tokens/vault-store";
import { ClioError, type ClioManageGateway } from "./gateway";
import { CLIO_BASE_URL, refreshTokens } from "./oauth";
import {
  BILL_FIELDS,
  CALENDAR_ENTRY_STATE_FIELDS,
  CALENDAR_FIELDS,
  CONTACT_FIELDS,
  DOCUMENT_UPLOAD_FIELDS,
  MATTER_CALENDAR_FIELDS,
  MATTER_FIELDS,
  clioBillSchema,
  clioCalendarEntryRefSchema,
  clioCalendarEntryStateSchema,
  clioCalendarSchema,
  clioContactSchema,
  clioDocumentCreatedSchema,
  clioMatterCalendarEntrySchema,
  clioMatterSchema,
  pageSchema,
  type ClioCalendarEntryInput,
  type ClioCalendarEntryState,
  type ClioMatterCalendarEntry,
  type StoredTokens,
} from "./schemas";
import type { ClioDocumentUpload } from "./gateway";

const PAGE_LIMIT = 200; // maximum documenté par requête d'index
const MAX_PER_MINUTE = 45; // marge sous la limite documentée de 50 req/min par jeton
const MAX_ATTEMPTS = 4;
const MAX_PAGES = 50;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ClioManageClient — API v4, région CA : lecture (ADR 0014) et écriture des seules entrées de calendrier
 * des dates de cour (ADR 0025).
 * Débit borné (45 req/min), `Retry-After` respecté sur 429, reprise exponentielle sur 5xx,
 * pagination suivie par `meta.paging.next` (même hôte uniquement), réponses validées par Zod,
 * jeton rafraîchi 60 s avant échéance. Aucune réponse brute n'est journalisée.
 */
export class ClioManageClient implements ClioManageGateway {
  readonly isMock = false;
  private readonly calls: number[] = [];

  constructor(
    private readonly tokens: OAuthTokenStore,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleep: Sleep = realSleep,
    private readonly now: () => number = Date.now,
  ) {}

  async findContactsByEmail(email: string) {
    return this.list("/api/v4/contacts.json", { query: email, fields: CONTACT_FIELDS }, clioContactSchema);
  }

  async listMattersForClient(clientId: number) {
    return this.list(
      "/api/v4/matters.json",
      { client_id: String(clientId), fields: MATTER_FIELDS },
      clioMatterSchema,
    );
  }

  async getMatter(matterId: number) {
    const body = await this.request(
      new URL(`/api/v4/matters/${matterId}.json?fields=${encodeURIComponent(MATTER_FIELDS)}`, CLIO_BASE_URL),
    );
    if (body === null) return null;
    const parsed = clioMatterSchema.safeParse((body as { data?: unknown }).data);
    if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
    return parsed.data;
  }

  async listBillsForMatter(matterId: number) {
    return this.list(
      "/api/v4/bills.json",
      { matter_id: String(matterId), fields: BILL_FIELDS },
      clioBillSchema,
    );
  }

  async listWritableCalendars() {
    return this.list(
      "/api/v4/calendars.json",
      { writeable: "true", fields: CALENDAR_FIELDS },
      clioCalendarSchema,
    );
  }

  async createCalendarEntry(input: ClioCalendarEntryInput) {
    const body = await this.request(new URL("/api/v4/calendar_entries.json?fields=id", CLIO_BASE_URL), {
      method: "POST",
      body: entryBody(input),
    });
    const parsed = clioCalendarEntryRefSchema.safeParse(body);
    if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
    return parsed.data.data.id;
  }

  async updateCalendarEntry(id: string, input: ClioCalendarEntryInput) {
    const body = await this.request(
      new URL(`/api/v4/calendar_entries/${encodeURIComponent(id)}.json?fields=id`, CLIO_BASE_URL),
      { method: "PATCH", body: entryBody(input) },
    );
    return body !== null;
  }

  async getCalendarEntry(id: string): Promise<ClioCalendarEntryState> {
    const url = new URL(`/api/v4/calendar_entries/${encodeURIComponent(id)}.json`, CLIO_BASE_URL);
    url.searchParams.set("fields", CALENDAR_ENTRY_STATE_FIELDS);
    const body = await this.request(url);
    if (body === null) return { state: "gone" };
    const parsed = clioCalendarEntryStateSchema.safeParse(body);
    if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
    const d = parsed.data.data;
    return {
      state: "found",
      startAt: d.start_at ?? null,
      endAt: d.end_at ?? null,
      allDay: d.all_day ?? false,
    };
  }

  async deleteCalendarEntry(id: string) {
    await this.request(new URL(`/api/v4/calendar_entries/${encodeURIComponent(id)}.json`, CLIO_BASE_URL), {
      method: "DELETE",
    });
  }

  /**
   * Dépôt d'un document (openapi.json v4, vérifié le 2026-10-28) : 1) création avec le dossier (ou le
   * document précédent pour une nouvelle version) ; 2) envoi du fichier, côté serveur, sur l'URL S3
   * signée fournie par Clio (https, hôte S3 d'Amazon, port par défaut, aucune redirection suivie) ;
   * 3) fin du dépôt (fully_uploaded). Aucun lien de Clio ni d'Amazon n'est transmis au navigateur.
   */
  async uploadDocument(input: ClioDocumentUpload): Promise<number> {
    const create = new URL("/api/v4/documents.json", CLIO_BASE_URL);
    create.searchParams.set("fields", DOCUMENT_UPLOAD_FIELDS);
    const body = await this.request(create, {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: input.name,
          content_type: input.contentType,
          parent: input.previousDocumentId
            ? { id: input.previousDocumentId, type: "Document" }
            : { id: input.matterId, type: "Matter" },
        },
      }),
    });
    const parsed = clioDocumentCreatedSchema.safeParse(body);
    if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
    const { id, latest_document_version: version } = parsed.data.data;
    const target = new URL(version.put_url);
    if (
      target.protocol !== "https:" ||
      target.port !== "" ||
      !/^[a-z0-9.-]+\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/i.test(target.hostname)
    )
      throw new ClioError("INVALID_RESPONSE");
    const headers: Record<string, string> = {};
    const raw = version.put_headers;
    const pairs = Array.isArray(raw) ? raw.map((h) => [h.name, h.value] as const) : Object.entries(raw ?? {});
    for (const [name, value] of pairs)
      if (/^(content-type|x-amz-[a-z0-9-]+)$/i.test(name)) headers[name] = value;
    const put = await this.fetchImpl(target, {
      method: "PUT",
      headers,
      body: input.bytes as unknown as BodyInit,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      // Jamais suivre une redirection : le fichier n'irait que vers l'hôte vérifié ci-dessus.
      redirect: "error",
    });
    if (!put.ok) throw new ClioError("UPSTREAM");
    const done = new URL(`/api/v4/documents/${id}.json`, CLIO_BASE_URL);
    done.searchParams.set("fields", "id");
    const finished = await this.request(done, {
      method: "PATCH",
      body: JSON.stringify({ data: { uuid: version.uuid, fully_uploaded: true } }),
    });
    // 404 sur la fin du dépôt : échec (le prochain essai recrée le document ; risque de doublon noté, ADR 0038).
    if (finished === null) throw new ClioError("UPSTREAM");
    return id;
  }

  /** Entrées d'agenda d'un dossier (pagination par curseur, ordre id croissant). */
  async listMatterCalendarEntries(
    matterId: number,
    updatedSince: string | null,
  ): Promise<ClioMatterCalendarEntry[]> {
    const rows = await this.list(
      "/api/v4/calendar_entries.json",
      {
        matter_id: String(matterId),
        fields: MATTER_CALENDAR_FIELDS,
        order: "id(asc)",
        owner_entries_across_all_users: "true",
        ...(updatedSince ? { updated_since: updatedSince } : {}),
      },
      clioMatterCalendarEntrySchema,
    );
    return rows
      .filter((r) => r.start_at)
      .map((r) => ({
        id: r.id,
        summary: r.summary ?? "",
        location: r.location ?? null,
        startAt: r.start_at!,
        endAt: r.end_at ?? null,
        allDay: r.all_day ?? false,
        eventType: r.calendar_entry_event_type?.name ?? null,
      }));
  }

  private async list<T extends z.ZodType>(
    path: string,
    params: Record<string, string>,
    item: T,
  ): Promise<z.infer<T>[]> {
    const first = new URL(path, CLIO_BASE_URL);
    for (const [k, v] of Object.entries(params)) first.searchParams.set(k, v);
    first.searchParams.set("limit", String(PAGE_LIMIT));
    const out: z.infer<T>[] = [];
    let next: URL | null = first;
    for (let page = 0; next && page < MAX_PAGES; page += 1) {
      const body = await this.request(next);
      const parsed = pageSchema(item).safeParse(body);
      if (!parsed.success) throw new ClioError("INVALID_RESPONSE");
      out.push(...(parsed.data.data as z.infer<T>[]));
      const nextUrl: string | undefined = parsed.data.meta?.paging?.next;
      next = nextUrl && new URL(nextUrl).origin === CLIO_BASE_URL ? new URL(nextUrl) : null;
    }
    return out;
  }

  private async accessToken(): Promise<string> {
    let tokens: StoredTokens | null = await this.tokens.get();
    if (!tokens) throw new ClioError("NOT_CONNECTED");
    if (tokens.expires_at && tokens.expires_at - 60_000 < this.now()) {
      if (!tokens.refresh_token) throw new ClioError("TOKEN_REVOKED");
      try {
        tokens = await refreshTokens(tokens.refresh_token, this.fetchImpl);
        await this.tokens.save(tokens);
      } catch (error) {
        // Rafraîchissement concurrent (planificateur + bouton) : si un autre processus a déjà
        // enregistré un jeton neuf, on l'utilise au lieu d'échouer (revue Phase 2, F5).
        const latest = await this.tokens.get();
        if (
          latest &&
          latest.access_token !== tokens.access_token &&
          (!latest.expires_at || latest.expires_at > this.now())
        )
          return latest.access_token;
        throw error;
      }
    }
    return tokens.access_token;
  }

  private async throttle() {
    const cutoff = this.now() - 60_000;
    while (this.calls.length && this.calls[0]! < cutoff) this.calls.shift();
    if (this.calls.length >= MAX_PER_MINUTE) await this.sleep(this.calls[0]! + 60_000 - this.now());
    this.calls.push(this.now());
  }

  /** Retourne le JSON (ou {} sur 204), ou null sur 404. Une écriture n'est jamais rejouée après un 5xx. */
  private async request(
    url: URL,
    write?: { method: "POST" | "PATCH" | "DELETE"; body?: string },
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.throttle();
      const res = await this.fetchImpl(url, {
        method: write?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          Accept: "application/json",
          ...(write?.body ? { "Content-Type": "application/json" } : {}),
        },
        body: write?.body,
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (res.status === 401) throw new ClioError("TOKEN_REVOKED");
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (attempt === MAX_ATTEMPTS) throw new ClioError("RATE_LIMITED");
        await this.sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000);
        continue;
      }
      if (res.status >= 500) {
        // Une création peut avoir abouti malgré l'erreur : pas de nouvelle tentative (évite les doublons).
        if (attempt === MAX_ATTEMPTS || write?.method === "POST") throw new ClioError("UPSTREAM");
        await this.sleep(2 ** attempt * 500);
        continue;
      }
      if (!res.ok) throw new ClioError("UPSTREAM");
      if (res.status === 204) return {};
      return res.json().catch(() => {
        throw new ClioError("INVALID_RESPONSE");
      });
    }
    throw new ClioError("UPSTREAM");
  }
}

/** Corps d'une entrée de calendrier Clio (POST / PATCH /calendar_entries). */
function entryBody(input: ClioCalendarEntryInput): string {
  return JSON.stringify({
    data: {
      calendar_owner: { id: input.calendarId },
      ...(input.matterId ? { matter: { id: input.matterId } } : {}),
      summary: input.summary,
      description: input.description,
      location: input.location,
      start_at: input.startAt,
      end_at: input.endAt,
      all_day: input.allDay,
      send_email_notification: false,
    },
  });
}
