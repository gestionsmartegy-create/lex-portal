/**
 * Sert le build `output: "standalone"` (celui de la production) pour les e2e (ADR 0011).
 * Next.js ne copie pas `public/` ni `.next/static/` dans le dossier autonome : on le fait ici.
 * Usage : node scripts/serve-standalone.mts <port>
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const port = process.argv[2] ?? "3100";
const dir = ".next/standalone";
if (!existsSync(`${dir}/server.js`)) throw new Error("Build autonome absent : lancer « pnpm build ».");

cpSync("public", `${dir}/public`, { recursive: true });
cpSync(".next/static", `${dir}/.next/static`, { recursive: true });

const server = spawn("node", [`${dir}/server.js`], {
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: "localhost" },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
