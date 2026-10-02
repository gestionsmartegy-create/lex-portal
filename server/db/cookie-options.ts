/**
 * Attributs des cookies de session Supabase (ADR 0010, revue J3 E1).
 * @supabase/ssr pose httpOnly: false par défaut : on l'impose à true. Le portail
 * n'utilise AUCUN client Supabase dans le navigateur ; les jetons ne doivent
 * jamais être lisibles en JavaScript. Partagé par proxy.ts (sans « server-only »).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
