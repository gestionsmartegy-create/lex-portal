import { z } from "zod";

/**
 * Variables publiques (exposées au navigateur). N'ajouter ici QUE des valeurs
 * non sensibles. Les secrets vont dans server/env.ts.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // Lien public de prise de rendez-vous Clio Grow (déjà utilisé sur lexcanadalaw.com).
  NEXT_PUBLIC_CLIO_BOOKING_URL: z.url().default("https://2025.ca.cliogrow.com/book"),
});

// Accès explicite à chaque variable : Next.js ne remplace que les références littérales.
export const publicEnv = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_CLIO_BOOKING_URL: process.env.NEXT_PUBLIC_CLIO_BOOKING_URL || undefined,
});
