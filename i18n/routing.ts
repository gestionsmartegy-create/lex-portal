import { defineRouting } from "next-intl/routing";

// ADR 0006 : anglais par défaut ; un navigateur francophone est dirigé vers /fr.
export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
