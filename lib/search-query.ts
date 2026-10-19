import { z } from "zod";

/**
 * Texte de recherche du cabinet (ADR 0033) avant un filtre PostgREST `.or(...ilike...)` :
 * 2 à 80 caractères ; les caractères qui structurent le filtre (virgule, parenthèses, guillemet,
 * deux-points, barre oblique inverse) et les jokers ilike (%, _, *) deviennent des espaces.
 * Le point reste permis (« 2024.001 ») : dans la valeur, il n'a pas de sens pour PostgREST.
 */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(80)
  .transform((q) =>
    q
      .replace(/[%,()*\\"_:]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(z.string().min(2));

export function sanitizeSearch(raw: unknown): string | null {
  const parsed = searchQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
