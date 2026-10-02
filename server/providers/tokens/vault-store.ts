import "server-only";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { storedTokensSchema, type StoredTokens } from "@/server/providers/clio/schemas";

/**
 * OAuthTokenStore — Supabase Vault (ADR 0013, ADR 0014). Les jetons ne quittent jamais
 * le serveur ni le coffre ; ils ne sont jamais journalisés (AGENTS.md §2.2).
 * service_role : RPC integration_* uniquement (usage permis : connexions d'intégration).
 */
export interface OAuthTokenStore {
  get(): Promise<StoredTokens | null>;
  save(tokens: StoredTokens, opts?: { scopes?: string[]; actorId?: string | null }): Promise<void>;
  report(ok: boolean, errorCode?: string): Promise<void>;
  disconnect(): Promise<void>;
}

export class VaultTokenStore implements OAuthTokenStore {
  constructor(
    private readonly provider: "clio_manage",
    private readonly region: string,
  ) {}

  async get(): Promise<StoredTokens | null> {
    const { data, error } = await createSupabaseServiceClient().rpc("integration_read_tokens", {
      p_provider: this.provider,
      p_region: this.region,
    });
    if (error || !data) return null;
    try {
      const parsed = storedTokensSchema.safeParse(JSON.parse(data));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async save(tokens: StoredTokens, opts: { scopes?: string[]; actorId?: string | null } = {}) {
    const { error } = await createSupabaseServiceClient().rpc("integration_save_tokens", {
      p_provider: this.provider,
      p_region: this.region,
      p_payload: JSON.stringify(tokens),
      p_scopes: opts.scopes ?? [],
      p_actor: opts.actorId ?? undefined,
    });
    if (error) throw new Error("TOKEN_STORE_WRITE_FAILED");
  }

  async report(ok: boolean, errorCode?: string) {
    await createSupabaseServiceClient().rpc("integration_report", {
      p_provider: this.provider,
      p_region: this.region,
      p_ok: ok,
      p_error: errorCode ?? undefined,
    });
  }

  async disconnect() {
    await createSupabaseServiceClient().rpc("integration_disconnect", {
      p_provider: this.provider,
      p_region: this.region,
    });
  }
}
