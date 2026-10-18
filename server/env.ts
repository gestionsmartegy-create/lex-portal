import "server-only";
import { z } from "zod";

const integrationMode = z.enum(["mock", "live"]).default("mock");

/**
 * Variables serveur, validées au premier accès. Les secrets (clé service_role,
 * secret cron) ne doivent JAMAIS être importés côté client (AGENTS.md §2.2).
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SMTP_URL: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("Lex Canada Law <no-reply@lexcanadalaw.test>"),
    CRON_SECRET: z.string().min(32).optional(),
    INTEGRATION_MODE_CLIO: integrationMode,
    INTEGRATION_MODE_SHAREPOINT: integrationMode,
    INTEGRATION_MODE_SIGNATURE: integrationMode,
    INTEGRATION_MODE_PAYMENTS: integrationMode,
    INTEGRATION_MODE_MALWARE: integrationMode,
    // Agendas Outlook du personnel (lot 4, ADR 0031) : « live » indisponible avant l'accès Microsoft du cabinet.
    INTEGRATION_MODE_OUTLOOK: integrationMode,
    // Assistant de rédaction (contrats, ADR 0032) : « live » (OpenAI) indisponible avant les décisions du cabinet.
    INTEGRATION_MODE_AI: integrationMode,
    // Nombre de proxys de confiance devant l'application (revue J3, M2) : l'IP du client
    // est lue à droite de x-forwarded-for, en sautant ce nombre de proxys.
    // Clio Manage, région CA (Phase 2, ADR 0014) : requis seulement si INTEGRATION_MODE_CLIO=live.
    CLIO_CLIENT_ID: z.string().min(1).optional(),
    CLIO_CLIENT_SECRET: z.string().min(1).optional(),
    // Serveur de TEST uniquement (ADR 0016) : autorise la connexion de démonstration du personnel
    // (*.test, mot de passe). Jamais en production : le domaine *.test n'y existe pas en base.
    STAFF_DEMO_LOGIN: z.enum(["enabled", "disabled"]).default("disabled"),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  })
  .refine((e) => e.INTEGRATION_MODE_CLIO !== "live" || Boolean(e.CLIO_CLIENT_ID && e.CLIO_CLIENT_SECRET), {
    message: "CLIO_CLIENT_ID et CLIO_CLIENT_SECRET sont requis en mode live",
  })
  // Liens d'invitation et de réinitialisation : jamais « localhost » en production (revue J3, F1).
  .refine((e) => e.NODE_ENV !== "production" || Boolean(process.env.APP_BASE_URL), {
    message: "APP_BASE_URL est obligatoire en production",
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
