/**
 * Échappe une saisie libre pour un motif SQL LIKE/ILIKE : `\`, `%` et `_` deviennent littéraux.
 * L'astérisque est retiré : PostgREST le traite comme un joker dans les motifs.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
}
