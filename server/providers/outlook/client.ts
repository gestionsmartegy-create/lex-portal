import "server-only";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { OutlookError, type OutlookCalendarGateway } from "./gateway";
import { refreshOutlookTokens } from "./oauth";
import {
  busyBlockSchema,
  graphCalendarListSchema,
  graphCalendarViewSchema,
  graphIdSchema,
  outlookTokensSchema,
  type BusyBlock,
  type OutlookTokens,
  type ReminderEventInput,
} from "./schemas";

/**
 * Client Microsoft Graph des agendas (ADR 0043), permissions déléguées, une personne à la fois.
 * Points d'accès confirmés dans la documentation officielle (docs/outlook-integration.md §8) :
 * - plages occupées : GET /me/calendarView, champs start, end, showAs, isCancelled SEULEMENT
 *   (jamais le titre, le lieu, les participants ni le contenu) ;
 * - agenda « Lex Portail » : GET et POST /me/calendars ;
 * - rappels : POST /me/calendars/{id}/events, PATCH et DELETE /me/events/{id}, affichés « disponible ».
 * Erreurs : codes internes seulement (OutlookError), jamais la réponse brute de Microsoft.
 */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const REMINDER_CALENDAR_NAME = "Lex Portail";
/** Une plage « provisoire » ou « libre » ne bloque pas une audience. */
const BUSY_STATES = new Set(["busy", "oof"]);
const MAX_PAGES = 20;
const MAX_BLOCKS = 1000;
/** Marge avant l'échéance du jeton d'accès. */
const EXPIRY_MARGIN_MS = 60_000;

/** Jetons d'agenda par personne. Implémentation : Supabase Vault, par fonctions réservées au serveur. */
export interface OutlookTokenStore {
  get(userId: string): Promise<OutlookTokens | null>;
  /** Remplace les jetons d'une connexion active (renouvellement). */
  update(userId: string, tokens: OutlookTokens): Promise<void>;
}

/**
 * service_role : lecture et renouvellement des jetons d'intégration (usage permis, AGENTS.md §6),
 * toujours après un contrôle du rôle sur la session, ou depuis le planificateur.
 */
export class VaultOutlookTokenStore implements OutlookTokenStore {
  async get(userId: string): Promise<OutlookTokens | null> {
    const { data, error } = await createSupabaseServiceClient().rpc("calendar_read_tokens", {
      p_user: userId,
    });
    if (error || !data) return null;
    try {
      const parsed = outlookTokensSchema.safeParse(JSON.parse(data));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async update(userId: string, tokens: OutlookTokens): Promise<void> {
    const { data, error } = await createSupabaseServiceClient().rpc("calendar_update_tokens", {
      p_user: userId,
      p_payload: JSON.stringify(tokens),
    });
    if (error) throw new OutlookError("UPSTREAM");
    // Connexion coupée pendant le renouvellement : le jeton neuf ne sert pas.
    if (!data) throw new OutlookError("NOT_CONNECTED");
  }
}

/** « 2026-11-10T14:00:00.0000000 » (UTC, demandé par l'en-tête Prefer) → ISO avec « Z ». */
function graphUtcToIso(dateTime: string): string | null {
  const date = new Date(`${dateTime.replace(/(\.\d{3})\d+$/, "$1")}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO → heure UTC sans « Z », comme l'attend dateTimeTimeZone de Graph. */
function isoToGraphUtc(iso: string) {
  return { dateTime: new Date(iso).toISOString().replace(/Z$/, ""), timeZone: "UTC" };
}

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; allow404?: boolean };

export class GraphOutlookCalendarGateway implements OutlookCalendarGateway {
  readonly isMock = false;

  constructor(
    private readonly store: OutlookTokenStore = new VaultOutlookTokenStore(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Jeton d'accès valide ; renouvelé (et enregistré) s'il arrive à échéance ou si `force`. */
  private async accessToken(userId: string, force = false): Promise<string> {
    const tokens = await this.store.get(userId);
    if (!tokens) throw new OutlookError("NOT_CONNECTED");
    const fresh = tokens.expires_at === undefined || tokens.expires_at - EXPIRY_MARGIN_MS > Date.now();
    if (fresh && !force) return tokens.access_token;
    if (!tokens.refresh_token) throw new OutlookError("TOKEN_REVOKED");
    const renewed = await refreshOutlookTokens(tokens.refresh_token, this.fetchImpl);
    // Microsoft ne renvoie pas toujours les permissions : on garde celles de la connexion.
    const next = { ...renewed, scope: renewed.scope ?? tokens.scope };
    await this.store.update(userId, next);
    return next.access_token;
  }

  /** Appel Graph. `null` pour un 404 toléré ou une réponse sans corps (204). */
  private async request(userId: string, url: string, options: RequestOptions = {}): Promise<unknown> {
    // Jamais de jeton envoyé ailleurs qu'à Microsoft Graph (lien de page suivante compris).
    if (!url.startsWith(`${GRAPH_BASE}/`)) throw new OutlookError("INVALID_RESPONSE");
    const send = async (token: string) => {
      try {
        return await this.fetchImpl(url, {
          method: options.method ?? "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            Prefer: 'outlook.timezone="UTC"',
            ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new OutlookError("UPSTREAM");
      }
    };
    let res = await send(await this.accessToken(userId));
    // Jeton refusé avant son échéance : un seul renouvellement, puis « à reconnecter ».
    if (res.status === 401) res = await send(await this.accessToken(userId, true));
    if (res.status === 401) throw new OutlookError("TOKEN_REVOKED");
    if (res.status === 404 && options.allow404) return null;
    if (res.status === 429 || res.status === 503) throw new OutlookError("RATE_LIMITED");
    if (!res.ok) throw new OutlookError("UPSTREAM");
    if (res.status === 204) return null;
    return res.json().catch(() => {
      throw new OutlookError("INVALID_RESPONSE");
    });
  }

  async getBusyBlocks(userId: string, from: Date, to: Date): Promise<BusyBlock[]> {
    const first = new URL(`${GRAPH_BASE}/me/calendarView`);
    first.searchParams.set("startDateTime", from.toISOString());
    first.searchParams.set("endDateTime", to.toISOString());
    first.searchParams.set("$select", "start,end,showAs,isCancelled");
    first.searchParams.set("$top", "100");
    const blocks: BusyBlock[] = [];
    let url: string | undefined = first.toString();
    for (let page = 0; url && page < MAX_PAGES && blocks.length < MAX_BLOCKS; page += 1) {
      const parsed = graphCalendarViewSchema.safeParse(await this.request(userId, url));
      if (!parsed.success) throw new OutlookError("INVALID_RESPONSE");
      for (const event of parsed.data.value) {
        if (event.isCancelled || !BUSY_STATES.has(event.showAs ?? "busy")) continue;
        const block = busyBlockSchema.safeParse({
          start: graphUtcToIso(event.start.dateTime),
          end: graphUtcToIso(event.end.dateTime),
        });
        if (block.success) blocks.push(block.data);
      }
      url = parsed.data["@odata.nextLink"];
    }
    return blocks.slice(0, MAX_BLOCKS);
  }

  async ensureReminderCalendar(userId: string, knownId: string | null): Promise<string> {
    if (knownId) {
      const known = await this.request(
        userId,
        `${GRAPH_BASE}/me/calendars/${encodeURIComponent(knownId)}?$select=id`,
        { allow404: true },
      );
      if (known) return knownId;
    }
    // L'agenda existe peut-être déjà (reconnexion) : on ne crée pas de doublon.
    const list = graphCalendarListSchema.safeParse(
      await this.request(userId, `${GRAPH_BASE}/me/calendars?$select=id,name&$top=100`),
    );
    if (!list.success) throw new OutlookError("INVALID_RESPONSE");
    const existing = list.data.value.find((c) => c.name === REMINDER_CALENDAR_NAME);
    if (existing) return existing.id;
    const created = graphIdSchema.safeParse(
      await this.request(userId, `${GRAPH_BASE}/me/calendars`, {
        method: "POST",
        body: { name: REMINDER_CALENDAR_NAME },
      }),
    );
    if (!created.success) throw new OutlookError("INVALID_RESPONSE");
    return created.data.id;
  }

  async upsertReminder(
    userId: string,
    calendarId: string,
    eventId: string | null,
    input: ReminderEventInput,
  ): Promise<string> {
    // « Disponible » : le rappel n'occupe pas l'agenda et ne crée pas de conflit. Aucun participant.
    const body = {
      subject: input.subject.slice(0, 255),
      start: isoToGraphUtc(input.startAt),
      end: isoToGraphUtc(input.endAt),
      showAs: "free",
      isReminderOn: true,
      reminderMinutesBeforeStart: 0,
    };
    if (eventId) {
      const updated = await this.request(userId, `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body,
        allow404: true,
      });
      if (updated) return eventId;
    }
    const created = graphIdSchema.safeParse(
      await this.request(userId, `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body,
      }),
    );
    if (!created.success) throw new OutlookError("INVALID_RESPONSE");
    return created.data.id;
  }

  async deleteReminder(userId: string, eventId: string): Promise<void> {
    await this.request(userId, `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      allow404: true,
    });
  }
}
