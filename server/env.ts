import "server-only";
import { z } from "zod";

const integrationMode = z.enum(["mock", "live"]).default("mock");

/**
 * Variables serveur, validées au premier accès. Les secrets (clé service_role,
 * secret cron) ne doivent JAMAIS être importés côté client (AGENTS.md §2.2).
 * En J1, aucune n'est obligatoire : elles le deviendront avec J2/J3.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  INTEGRATION_MODE_CLIO: integrationMode,
  INTEGRATION_MODE_SHAREPOINT: integrationMode,
  INTEGRATION_MODE_SIGNATURE: integrationMode,
  INTEGRATION_MODE_PAYMENTS: integrationMode,
  INTEGRATION_MODE_MALWARE: integrationMode,
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
