import "server-only";
import { hash, mockBusyBlocks } from "@/lib/outlook-simulator";
import type { OutlookCalendarGateway } from "./gateway";
import type { ReminderEventInput } from "./schemas";

/**
 * Simulateur Outlook (AGENTS.md §2.6-7) : un agenda FICTIF par personne, stable d'un appel à l'autre.
 * Plages occupées en semaine selon un modèle fixe, décalé selon la personne, à l'heure de Halifax.
 * Les rappels sont gardés en mémoire du processus. Aucune donnée réelle.
 */
export { mockBusyBlocks };

const REMINDERS = new Map<string, ReminderEventInput & { userId: string }>();
let nextId = 0;

export class MockOutlookCalendarGateway implements OutlookCalendarGateway {
  readonly isMock = true;
  async getBusyBlocks(userId: string, from: Date, to: Date) {
    return mockBusyBlocks(userId, from, to);
  }
  async ensureReminderCalendar(userId: string, knownId: string | null) {
    return knownId ?? `mock-cal-${hash(userId).toString(36)}`;
  }
  async upsertReminder(
    userId: string,
    _calendarId: string,
    eventId: string | null,
    input: ReminderEventInput,
  ) {
    if (eventId && REMINDERS.has(eventId)) {
      REMINDERS.set(eventId, { ...input, userId });
      return eventId;
    }
    nextId += 1;
    const id = `mock-evt-${nextId.toString()}`;
    REMINDERS.set(id, { ...input, userId });
    return id;
  }
  async deleteReminder(_userId: string, eventId: string) {
    REMINDERS.delete(eventId);
  }
}
