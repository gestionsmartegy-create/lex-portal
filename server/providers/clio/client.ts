import "server-only";
import type { z } from "zod";
import type { OAuthTokenStore } from "@/server/providers/tokens/vault-store";
import { ClioError, type ClioManageGateway } from "./gateway";
import { CLIO_BASE_URL, refreshTokens } from "./oauth";
import {
  BILL_FIELDS,
  CONTACT_FIELDS,
  MATTER_FIELDS,
  clioBillSchema,
  clioContactSchema,
  clioMatterSchema,
  pageSchema,
  type StoredTokens,
} from "./schemas";

const PAGE_LIMIT = 200; // maximum documenté par requête d'index
const MAX_PER_MINUTE = 45; // marge sous la limite documentée de 50 req/min par jeton
const MAX_ATTEMPTS = 4;
const MAX_PAGES = 50;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ClioManageClient — API v4, région CA, LECTURE seulement (ADR 0014).
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

  /** Retourne le JSON, ou null sur 404. */
  private async request(url: URL): Promise<unknown> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.throttle();
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: "application/json" },
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
        if (attempt === MAX_ATTEMPTS) throw new ClioError("UPSTREAM");
        await this.sleep(2 ** attempt * 500);
        continue;
      }
      if (!res.ok) throw new ClioError("UPSTREAM");
      return res.json().catch(() => {
        throw new ClioError("INVALID_RESPONSE");
      });
    }
    throw new ClioError("UPSTREAM");
  }
}
