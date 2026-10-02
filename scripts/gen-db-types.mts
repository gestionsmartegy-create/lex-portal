/**
 * Régénère types/database.ts depuis Supabase local, avec un en-tête
 * « fichier généré ». Usage : pnpm db:types
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const types = execFileSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "typescript", "--local", "--schema", "public"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const header = [
  "// ============================================================================",
  "// FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN (AGENTS.md §3)",
  "// Source : migrations supabase/migrations/* · Commande : pnpm db:types",
  "// Seul le schéma public (exposé à l'API) est typé ; private et audit ne le sont pas.",
  "// ============================================================================",
  "",
].join("\n");

writeFileSync(fileURLToPath(new URL("../types/database.ts", import.meta.url)), header + types);
console.log("✓ types/database.ts régénéré");
