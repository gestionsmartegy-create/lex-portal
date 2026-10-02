import { execFileSync } from "node:child_process";

/** Lit la configuration de Supabase LOCAL (jamais affichée) et refuse tout hôte distant. */
export default function setup() {
  const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string | undefined>;
  const url = status.API_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Tests d'intégration : Supabase LOCAL requis (pnpm db:start).");
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  process.env.APP_BASE_URL = "http://localhost:3000";
}
