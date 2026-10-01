/**
 * Génère des mots de passe aléatoires pour les comptes fictifs du seed et les
 * applique via l'API admin de Supabase **local**. Les mots de passe ne sont
 * JAMAIS affichés : ils sont écrits uniquement dans supabase/seed.local.md
 * (ignoré par Git, illisible pour les agents — .claude/settings.json).
 *
 * Usage : pnpm db:seed-passwords   (après pnpm db:reset)
 */
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED_USERS = [
  { id: "a0000000-0000-4000-8000-000000000001", email: "john.doe@example.com", role: "client" },
  { id: "a0000000-0000-4000-8000-000000000002", email: "jane.roe@example.com", role: "client" },
  {
    id: "a0000000-0000-4000-8000-0000000000b1",
    email: "demo.staff@lexcanadalaw.com",
    role: "staff (simulé)",
  },
  {
    id: "a0000000-0000-4000-8000-0000000000a1",
    email: "demo.admin@lexcanadalaw.com",
    role: "firm_admin (simulé)",
  },
] as const;

const OUTPUT = fileURLToPath(new URL("../supabase/seed.local.md", import.meta.url));

type LocalStatus = { API_URL: string; SERVICE_ROLE_KEY: string; ANON_KEY: string };

function readLocalStatus(): LocalStatus {
  const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const json = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string | undefined>;
  const apiUrl = json.API_URL;
  const key = json.SERVICE_ROLE_KEY ?? json.SECRET_KEY;
  const anonKey = json.ANON_KEY ?? json.PUBLISHABLE_KEY;
  if (!apiUrl || !key || !anonKey) throw new Error("Supabase local introuvable : lancer « pnpm db:start ».");

  // Garde-fou : ce script ne touche JAMAIS un projet distant.
  const host = new URL(apiUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refus : ${host} n'est pas une instance Supabase locale.`);
  }
  return { API_URL: apiUrl, SERVICE_ROLE_KEY: key, ANON_KEY: anonKey };
}

// 24 caractères, au moins une minuscule, une majuscule, un chiffre et un symbole.
function generatePassword(length = 24): string {
  const sets = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_=+?"];
  const all = sets.join("");
  const chars = sets.map((set) => set[randomInt(set.length)]!);
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

async function main() {
  const { API_URL, SERVICE_ROLE_KEY, ANON_KEY } = readLocalStatus();
  const rows: string[] = [];

  for (const user of SEED_USERS) {
    const password = generatePassword();
    const res = await fetch(`${API_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok)
      throw new Error(`Échec pour ${user.email} (HTTP ${res.status}). Le seed a-t-il été chargé ?`);
    // Vérification en mémoire : le compte peut se connecter (session aal1, MFA à enrôler en J3).
    const login = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    if (!login.ok) {
      const detail = (await login.json().catch(() => ({}))) as { error_code?: string; msg?: string };
      throw new Error(
        `Connexion impossible pour ${user.email} (HTTP ${login.status} ${detail.error_code ?? ""} ${detail.msg ?? ""}).`,
      );
    }
    console.log(`  ✓ ${user.email} : connexion vérifiée`);
    rows.push(`| ${user.role} | ${user.email} | \`${password}\` |`);
  }

  writeFileSync(
    OUTPUT,
    [
      "# Comptes de test locaux — NE PAS COMMITTER",
      "",
      `Générés le ${new Date().toISOString()} par \`pnpm db:seed-passwords\`. Valables uniquement sur Supabase local.`,
      "Régénérés à chaque exécution (après chaque `pnpm db:reset`).",
      "",
      "| Rôle | E-mail | Mot de passe |",
      "|---|---|---|",
      ...rows,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log(`✓ ${SEED_USERS.length} mots de passe générés → supabase/seed.local.md (non affichés).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erreur inattendue");
  process.exit(1);
});
