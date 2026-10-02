/**
 * Écrit .env.local à partir de Supabase LOCAL (URL, clés de démonstration, SMTP
 * Mailpit). N'affiche JAMAIS les valeurs ; refuse tout hôte non local.
 * Les variables déjà présentes dans .env.local et absentes de la liste gérée
 * sont conservées. Usage : pnpm env:local (après pnpm db:start).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUTPUT = fileURLToPath(new URL("../.env.local", import.meta.url));

const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string | undefined>;
const apiUrl = status.API_URL;
const anon = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
const service = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
if (!apiUrl || !anon || !service) throw new Error("Supabase local introuvable : lancer « pnpm db:start ».");

const host = new URL(apiUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Refus : ${host} n'est pas local.`);

const managed: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  APP_BASE_URL: "http://localhost:3000",
  SMTP_URL: "smtp://127.0.0.1:54325",
  EMAIL_FROM: "Lex Canada Law <no-reply@lexcanadalaw.test>",
  NEXT_PUBLIC_STAFF_SSO_ENABLED: "false",
};

const kept = existsSync(OUTPUT)
  ? readFileSync(OUTPUT, "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#") && !(line.split("=")[0]! in managed))
  : [];

writeFileSync(
  OUTPUT,
  [
    "# Généré par pnpm env:local — Supabase LOCAL uniquement. Ne jamais committer.",
    ...Object.entries(managed).map(([k, v]) => `${k}=${v}`),
    ...kept,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`✓ .env.local écrit (${Object.keys(managed).length} variables gérées, valeurs non affichées).`);
