import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Garde-fou AGENTS.md §2.2-2.3 : le code serveur (secrets, intégrations) ne doit
// jamais être importé par un composant ou du code partagé côté client.
const serverOnlyBoundary = {
  patterns: [
    {
      group: ["@/server", "@/server/*", "**/server/*"],
      message:
        "Code serveur interdit ici : passer par une Server Action ou un Server Component (AGENTS.md §3).",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "i18n/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", serverOnlyBoundary] },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react/no-danger": "error", // AGENTS.md §7 : pas de dangerouslySetInnerHTML
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/**",
    "diagrams/**",
    "docs/**",
    "types/database.ts",
    // Artefacts locaux de QA (captures, traces Playwright), ignorés par Git.
    ".tmp/**",
  ]),
]);

export default eslintConfig;
