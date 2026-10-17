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
