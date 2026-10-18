"use server";

import "server-only";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit } from "@/server/security/rate-limit";
import { searchStaff, type SearchResults } from "@/server/services/staff-search";
import { localeSchema } from "@/server/validation/auth";

/** Recherche globale (Ctrl K) : personnel seulement, sous sa session (RLS), 120 recherches par 5 minutes. */
export async function staffSearchAction(locale: string, q: string): Promise<SearchResults> {
  const { profile } = await requireStaff(localeSchema.catch("en").parse(locale));
  const empty = { matters: [], contracts: [], clients: [] };
  if (typeof q !== "string" || q.length > 80) return empty;
  if (!(await hitRateLimit(`staff_search:user:${profile.id}`, { max: 120, windowSeconds: 300 })))
    return empty;
  return searchStaff(q);
}
