import "server-only";
import { z } from "zod";

/** Plage occupée : début et fin seulement (ISO). */
export const busyBlockSchema = z
  .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
  .refine((b) => new Date(b.end) > new Date(b.start));
export type BusyBlock = z.infer<typeof busyBlockSchema>;

/** Rappel de préparation : un titre sans nom de client, une heure, un fuseau. Affiché « disponible ». */
export type ReminderEventInput = {
  subject: string;
  startAt: string;
  endAt: string;
  timeZone: string;
};

/** Jetons d'une personne, gardés dans Supabase Vault (jamais en clair en base ni dans un log). */
export const outlookTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  /** Échéance du jeton d'accès (ms depuis l'époque). */
  expires_at: z.number().int().optional(),
  /** Permissions accordées, séparées par des espaces (réponse de Microsoft). */
  scope: z.string().optional(),
});
export type OutlookTokens = z.infer<typeof outlookTokensSchema>;

/** Réponse du point de jetons Microsoft (OAuth 2.0). */
export const outlookTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

/** Réponses de Microsoft Graph : seuls les champs lus sont décrits, le reste est ignoré. */
const graphDateTime = z.object({ dateTime: z.string().min(10) });
export const graphCalendarViewSchema = z.object({
  value: z.array(
    z.object({
      start: graphDateTime,
      end: graphDateTime,
      showAs: z.string().optional(),
      isCancelled: z.boolean().optional(),
    }),
  ),
  "@odata.nextLink": z.string().optional(),
});
export const graphIdSchema = z.object({ id: z.string().min(1).max(512) });
export const graphCalendarListSchema = z.object({
  value: z.array(z.object({ id: z.string().min(1).max(512), name: z.string().optional() })),
});
