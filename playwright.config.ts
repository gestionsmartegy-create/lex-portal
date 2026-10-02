import { defineConfig, devices } from "@playwright/test";
import loadLocalSupabase from "./tests/integration/global-setup";

/**
 * e2e (ADR 0011) : build de PRODUCTION servi sur le port 3100, contre Supabase LOCAL.
 * La configuration locale est lue ici (avant le démarrage du serveur, qui en hérite),
 * jamais affichée ; tout hôte distant est refusé.
 */
loadLocalSupabase();
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
process.env.APP_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // Mac de 8 Go et limite de débit partagée : exécution en série
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", locale: "en-CA" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `pnpm build && node scripts/serve-standalone.mts ${PORT}`,
    url: `${BASE_URL}/en/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
