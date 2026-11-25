import "server-only";
import { z } from "zod";

const integrationMode = z.enum(["mock", "live"]).default("mock");
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

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
    // Serveur de test (ADR 0016) : adresse publique de Supabase Auth quand l'application lui parle
    // par une adresse interne. Sert seulement au départ vers Microsoft (lib/oauth-authorize-url).
    SUPABASE_PUBLIC_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SMTP_URL: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("Lex Canada Law <no-reply@lexcanadalaw.test>"),
    CRON_SECRET: z.string().min(32).optional(),
    INTEGRATION_MODE_CLIO: integrationMode,
    // Dépôt de documents dans Clio (ADR 0038) : simulateur tant que le cabinet n'a pas donné son accord,
    // même si la connexion Clio est réelle.
    INTEGRATION_MODE_CLIO_DOCUMENTS: integrationMode,
    INTEGRATION_MODE_SHAREPOINT: integrationMode,
    INTEGRATION_MODE_SIGNATURE: integrationMode,
    INTEGRATION_MODE_PAYMENTS: integrationMode,
    INTEGRATION_MODE_MALWARE: integrationMode,
    // Agendas Outlook du personnel (ADR 0031, 0043) : « live » = Microsoft Graph, avec les OUTLOOK_* ci-dessous.
    INTEGRATION_MODE_OUTLOOK: integrationMode,
    // Assistant de rédaction (contrats, ADR 0032, 0044) : « live » = OpenAI, avec les OPENAI_* ci-dessous.
    INTEGRATION_MODE_AI: integrationMode,
    // Nombre de proxys de confiance devant l'application (revue J3, M2) : l'IP du client
    // est lue à droite de x-forwarded-for, en sautant ce nombre de proxys.
    // Clio Manage, région CA (Phase 2, ADR 0014) : requis seulement si INTEGRATION_MODE_CLIO=live.
    CLIO_CLIENT_ID: z.string().min(1).optional(),
    CLIO_CLIENT_SECRET: z.string().min(1).optional(),
    // Agendas Outlook réels (ADR 0043) : requis seulement si INTEGRATION_MODE_OUTLOOK=live.
    // Une variable laissée vide (« OUTLOOK_TENANT_ID= ») vaut « absente ».
    OUTLOOK_TENANT_ID: z.preprocess(emptyAsUndefined, z.uuid().optional()),
    OUTLOOK_CLIENT_ID: z.preprocess(emptyAsUndefined, z.uuid().optional()),
    OUTLOOK_CLIENT_SECRET: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    // OpenAI (ADR 0044) : clé requise seulement si INTEGRATION_MODE_AI=live ; saisie par le cabinet, jamais
    // dans le dépôt ni dans un log. Modèle modifiable sans toucher au code.
    OPENAI_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(20).optional()),
    OPENAI_MODEL: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .regex(/^[A-Za-z0-9._:-]{1,100}$/)
        .default("gpt-5-mini"),
    ),
    // Serveur de TEST uniquement (ADR 0016) : autorise la connexion de démonstration du personnel
    // (*.test, mot de passe). Jamais en production : le domaine *.test n'y existe pas en base.
    STAFF_DEMO_LOGIN: z.enum(["enabled", "disabled"]).default("disabled"),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  })
  .refine((e) => e.INTEGRATION_MODE_CLIO !== "live" || Boolean(e.CLIO_CLIENT_ID && e.CLIO_CLIENT_SECRET), {
    message: "CLIO_CLIENT_ID et CLIO_CLIENT_SECRET sont requis en mode live",
  })
  .refine(
    (e) =>
      e.INTEGRATION_MODE_OUTLOOK !== "live" ||
      Boolean(e.OUTLOOK_TENANT_ID && e.OUTLOOK_CLIENT_ID && e.OUTLOOK_CLIENT_SECRET),
    { message: "OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_ID et OUTLOOK_CLIENT_SECRET sont requis en mode live" },
  )
  .refine((e) => e.INTEGRATION_MODE_AI !== "live" || Boolean(e.OPENAI_API_KEY), {
    message: "OPENAI_API_KEY est requis en mode live",
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
