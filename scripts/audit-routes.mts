/**
 * Audit des routes et des points d'entrée serveur (AGENTS.md §3, §7).
 *
 * Vérifie, sans rien exécuter, que chaque route API, chaque page protégée et
 * chaque Server Action revérifie la session côté serveur, que les fichiers de
 * `server/` sont bien `server-only`, et quelques motifs interdits.
 *
 * Usage : node scripts/audit-routes.mts [--json] [--changed]
 *   --changed : seuls les fichiers touchés par la branche (par rapport à origin/main,
 *               plus l'arbre de travail) comptent ; les manquements hérités du reste du
 *               code sont listés à part, pour le responsable technique, sans bloquer.
 * Sortie 1 s'il y a au moins un manquement (❌) retenu. Utilisé par l'agent revue-securite.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/**
 * Routes publiques PAR CONCEPTION (maintenu par le responsable technique).
 * Toute autre route API doit vérifier une session, un secret ou une signature.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "app/.well-known/security.txt/route.ts": "RFC 9116, contenu statique",
  "app/api/auth/callback/route.ts": "retour OAuth Supabase : échange du code, aucune donnée exposée",
  "app/api/security/csp-report/route.ts": "rapports CSP envoyés par le navigateur, limités en débit",
};

/** Pages publiques attendues sous app/[locale] (hors (auth), portal, admin). */
const PUBLIC_PAGES = new Set([
  "app/[locale]/page.tsx",
  "app/[locale]/[...rest]/page.tsx",
  "app/[locale]/styleguide/page.tsx",
]);

const AUTH_MARKERS = [
  /requireStaff\(/,
  /requireClientSession\(/,
  /getSessionRole\(/,
  /getUser\(/,
  /assertMatterAccess\(/,
  /CRON_SECRET/,
  /webhook-signature|verifyWebhookSignature/,
  /oauth-state/,
];

type Level = "ok" | "warn" | "fail";
type Finding = { level: Level; file: string; message: string; line?: number };
const findings: Finding[] = [];
const add = (level: Level, file: string, message: string, line?: number) =>
  findings.push({ level, file, message, line });

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const read = (f: string) => readFileSync(f, "utf8");
/** Code sans les commentaires de ligne et de bloc (pour ne pas compter les mentions). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const lineOf = (src: string, re: RegExp) => {
  const i = src.search(re);
  return i < 0 ? undefined : src.slice(0, i).split("\n").length;
};

const appFiles = walk(join(ROOT, "app"));
const serverFiles = walk(join(ROOT, "server"));
const uiFiles = [...appFiles, ...walk(join(ROOT, "components")), ...walk(join(ROOT, "lib"))];

// 1. Routes API --------------------------------------------------------------
for (const f of appFiles.filter((p) => /\/route\.ts$/.test(p))) {
  const r = rel(f);
  const src = code(read(f));
  if (PUBLIC_ROUTES[r]) {
    add("ok", r, `publique par conception : ${PUBLIC_ROUTES[r]}`);
    continue;
  }
  if (AUTH_MARKERS.some((m) => m.test(src))) add("ok", r, "session, secret ou signature vérifié");
  else add("fail", r, "aucune vérification de session, de secret ou de signature (AGENTS.md §3)");
}

// 2. Gabarits et pages protégées --------------------------------------------
const guards: Array<[string, RegExp, string]> = [
  ["app/[locale]/portal/layout.tsx", /requireClientSession\(/, "requireClientSession"],
  ["app/[locale]/admin/layout.tsx", /requireStaff\(/, "requireStaff"],
];
for (const [file, re, name] of guards) {
  const full = join(ROOT, file);
  if (!existsSync(full)) add("fail", file, "gabarit absent");
  else if (re.test(code(read(full)))) add("ok", file, `garde ${name} présente`);
  else add("fail", file, `le gabarit n'appelle plus ${name}`);
}
for (const f of appFiles.filter((p) => /\/page\.tsx$/.test(p))) {
  const r = rel(f);
  const src = code(read(f));
  if (/^app\/\[locale\]\/portal\//.test(r)) {
    if (/requireClientSession\(/.test(src)) add("ok", r, "revérifie la session client");
    else add("fail", r, "page du portail sans requireClientSession (chaque page revérifie, AGENTS.md §3)");
  } else if (/^app\/\[locale\]\/admin\//.test(r)) {
    if (/requireStaff\(/.test(src)) add("ok", r, "revérifie la session du personnel");
    else add("fail", r, "page de l'espace cabinet sans requireStaff (AGENTS.md §3)");
  } else if (/^app\/\[locale\]\/\(auth\)\//.test(r)) {
    add("ok", r, "page d'authentification (publique par nature)");
  } else if (PUBLIC_PAGES.has(r)) {
    add("ok", r, "page publique attendue");
  } else {
    add(
      "warn",
      r,
      "nouvelle page PUBLIQUE (hors portal/admin) : est-ce voulu ? Sinon, la placer sous portal/ ou admin/",
    );
  }
}

// 3. Server Actions ---------------------------------------------------------
for (const f of serverFiles.filter((p) => /^server\/actions\//.test(rel(p)))) {
  const r = rel(f);
  const raw = read(f);
  const src = code(raw);
  if (!/^\s*"use server"/m.test(raw)) add("fail", r, "fichier d'actions sans « use server »");
  const serviceNames = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@\/server\/services\/[^"]+"/g))
    for (const name of m[1]!.split(","))
      serviceNames.add(
        name
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      );
  const exportRe = /export\s+async\s+function\s+(\w+)/g;
  const positions: Array<{ name: string; start: number }> = [];
  for (const m of src.matchAll(exportRe)) positions.push({ name: m[1]!, start: m.index! });
  positions.forEach(({ name, start }, i) => {
    const body = src.slice(start, positions[i + 1]?.start ?? src.length);
    const line =
      raw.indexOf(`function ${name}`) >= 0
        ? raw.slice(0, raw.indexOf(`function ${name}`)).split("\n").length
        : undefined;
    const direct = AUTH_MARKERS.some((m) => m.test(body));
    const viaRls = /createSupabaseServerClient\(|supabase\.auth\./.test(body);
    const viaService = [...serviceNames].filter((s) => s && new RegExp(`\\b${s}\\(`).test(body));
    const zod = /\.(safeParse|parse)\(/.test(body);
    if (direct) add("ok", r, `${name}() revérifie la session`, line);
    else if (viaService.length)
      add(
        "warn",
        r,
        `${name}() s'appuie sur ${viaService.join(", ")} : confirmer que ce service vérifie la session et l'accès`,
        line,
      );
    else if (viaRls)
      add(
        "warn",
        r,
        `${name}() s'appuie sur le client avec session (RLS) ou le flux d'authentification : confirmer qu'aucun rôle n'est requis`,
        line,
      );
    else add("fail", r, `${name}() ne revérifie ni la session ni l'accès (AGENTS.md §3)`, line);
    if (!zod && /formData|FormData|input|payload/.test(body))
      add("warn", r, `${name}() reçoit une entrée sans la valider avec Zod ?`, line);
  });
}

// 4. server/ : server-only partout -------------------------------------------
const proxySrc = existsSync(join(ROOT, "proxy.ts")) ? read(join(ROOT, "proxy.ts")) : "";
for (const f of serverFiles) {
  const r = rel(f);
  if (/\.d\.ts$/.test(r)) continue;
  if (/import\s+"server-only"/.test(read(f))) continue;
  const importedByProxy = proxySrc.includes(`"@/${r.replace(/\.tsx?$/, "")}"`);
  if (importedByProxy)
    add(
      "warn",
      r,
      "sans « server-only » car partagé avec proxy.ts : ne doit contenir aucun secret ni accès à la base",
    );
  else add("fail", r, "import « server-only » manquant (AGENTS.md §3)");
}

// 5. Composants client qui importent server/ --------------------------------
for (const f of uiFiles) {
  const raw = read(f);
  if (!/^\s*"use client"/m.test(raw)) continue;
  const src = code(raw);
  for (const m of src.matchAll(/^import\s+(?!type\s)[^;]*from\s*"@\/server\/([^"]+)"/gm)) {
    if (m[1]!.startsWith("actions/")) continue; // une Server Action s'importe depuis le client
    add(
      "fail",
      rel(f),
      `composant client qui importe @/server/${m[1]} (AGENTS.md §3)`,
      lineOf(raw, new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    );
  }
}

// 6. Motifs interdits ou à justifier ----------------------------------------
for (const f of [...appFiles, ...serverFiles, ...uiFiles]) {
  const r = rel(f);
  const raw = read(f);
  const src = code(raw);
  if (/\.select\(\s*"\*"\s*\)/.test(src))
    add(
      "fail",
      r,
      'select("*") interdit : colonnes explicites (ADR 0009, AGENTS.md §6)',
      lineOf(raw, /\.select\(\s*"\*"\s*\)/),
    );
  if (/dangerouslySetInnerHTML/.test(src))
    add(
      "warn",
      r,
      "dangerouslySetInnerHTML : contenu sûr et non utilisateur ? (AGENTS.md §7)",
      lineOf(raw, /dangerouslySetInnerHTML/),
    );
  if (/createServiceClient\(/.test(src) && r !== "server/db/service-client.ts")
    add(
      "warn",
      r,
      "usage de service_role : usage permis par AGENTS.md §6 et justifié en commentaire ?",
      lineOf(raw, /createServiceClient\(/),
    );
  if (/NEXT_PUBLIC_\w*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD)/.test(src))
    add(
      "fail",
      r,
      "variable NEXT_PUBLIC_* qui ressemble à un secret (AGENTS.md §2.2)",
      lineOf(raw, /NEXT_PUBLIC_\w*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD)/),
    );
  if (/supabase-js|@supabase\/ssr/.test(src) && /^components\//.test(r) && /^\s*"use client"/m.test(raw))
    add(
      "warn",
      r,
      "client Supabase dans un composant client : l'accès aux données passe par le serveur (AGENTS.md §3)",
    );
}

// 7. Migrations : RLS dans la même migration que la table --------------------
const migDir = join(ROOT, "supabase", "migrations");
if (existsSync(migDir)) {
  for (const name of readdirSync(migDir).filter((n) => n.endsWith(".sql"))) {
    const r = `supabase/migrations/${name}`;
    const sql = readFileSync(join(migDir, name), "utf8").replace(/--.*$/gm, "");
    const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map(
      (m) => m[1]!,
    );
    // Activation en boucle : execute format('alter table public.%I enable row level security', t)
    const bulkRls = /format\(\s*'alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security'/i.test(sql);
    for (const t of tables) {
      const rls =
        bulkRls ||
        new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql);
      if (!rls)
        add(
          "fail",
          r,
          `table public.${t} créée sans « enable row level security » dans la même migration (AGENTS.md §6)`,
        );
    }
    for (const m of sql.matchAll(/security\s+definer/gi)) {
      const after = sql.slice(m.index!, m.index! + 400);
      if (!/set\s+search_path\s*=\s*''/i.test(after))
        add("warn", r, "fonction security definer : vérifier « set search_path = '' » (AGENTS.md §6)");
    }
  }
}

// Fichiers touchés par la branche (mode --changed) --------------------------
const changedOnly = process.argv.includes("--changed");
let changed = new Set<string>();
if (changedOnly) {
  const git = (args: string[]) => {
    try {
      return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
  const base = git(["merge-base", "origin/main", "HEAD"]).trim() || "origin/main";
  const list =
    git(["diff", "--name-only", base]) + "\n" + git(["ls-files", "--others", "--exclude-standard"]);
  changed = new Set(
    list
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}
const retained = changedOnly ? findings.filter((f) => changed.has(f.file)) : findings;
const inherited = changedOnly ? findings.filter((f) => !changed.has(f.file) && f.level !== "ok") : [];

// Rapport --------------------------------------------------------------------
const json = process.argv.includes("--json");
const order: Level[] = ["fail", "warn", "ok"];
const icon = { fail: "❌", warn: "⚠️ ", ok: "✅" };
if (json) console.log(JSON.stringify({ retained, inherited }, null, 2));
else {
  if (changedOnly) console.log(`Mode --changed : ${changed.size} fichier(s) touché(s) par la branche.`);
  for (const level of order) {
    const list = retained.filter((f) => f.level === level);
    if (level === "ok") {
      console.log(`\n✅ ${list.length} point(s) conforme(s)`);
      continue;
    }
    if (!list.length) continue;
    console.log(
      `\n${icon[level]} ${level === "fail" ? "Manquements (bloquants)" : "À vérifier"} : ${list.length}`,
    );
    for (const f of list) console.log(`  ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`);
  }
  if (inherited.length) {
    console.log(
      `\n📋 Hérité du code existant (hors de la branche, pour le responsable technique, non bloquant) : ${inherited.length}`,
    );
    for (const f of inherited)
      console.log(`  ${icon[f.level]} ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`);
  }
}
const fails = retained.filter((f) => f.level === "fail").length;
process.exit(fails ? 1 : 0);
