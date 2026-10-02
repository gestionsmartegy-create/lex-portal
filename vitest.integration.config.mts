import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests d'intégration contre Supabase LOCAL réel (vraies sessions Auth) — ADR 0010.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // « server-only » refuse tout import hors runtime serveur React : neutralisé ici.
      "server-only": fileURLToPath(new URL("./tests/integration/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
