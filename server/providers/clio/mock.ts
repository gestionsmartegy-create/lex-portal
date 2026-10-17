import "server-only";
import type { ClioManageGateway } from "./gateway";
import type {
  ClioBill,
  ClioCalendar,
  ClioCalendarEntryInput,
  ClioCalendarEntryState,
  ClioContact,
  ClioMatter,
} from "./schemas";

/**
 * MockClioManageGateway (AGENTS.md §2.6-7) : un faux Clio avec des données FICTIVES
 * (contacts @example.com). Tout dossier importé depuis ce mock est marqué is_mock.
 */
const CONTACTS: ClioContact[] = [
  { id: 900101, name: "Riley Demo", primary_email_address: "riley.demo@example.com", type: "Person" },
  {
    id: 900102,
    name: "Northwind Demo Inc.",
    primary_email_address: "legal@northwind.example.com",
    type: "Company",
  },
];

const MATTERS: ClioMatter[] = [
  {
    id: 7700001,
    display_number: "LC-2026-0201",
    description: "Work Permit Extension",
    status: "Open",
    open_date: "2026-08-14",
    close_date: null,
    practice_area: { name: "Immigration" },
    responsible_attorney: { name: "Me Wilson Saintelmy" },
    client: { id: 900101, name: "Riley Demo" },
  },
  {
    id: 7700002,
    display_number: "LC-2026-0202",
    description: "Shareholder Agreement",
    status: "Pending",
    open_date: "2026-09-02",
    close_date: null,
    practice_area: { name: "Corporate" },
    responsible_attorney: { name: "Me Wilson Saintelmy" },
    client: { id: 900102, name: "Northwind Demo Inc." },
  },
];

const BILLS: Record<number, ClioBill[]> = {
  7700001: [
    {
      id: 5500001,
      number: "INV-2026-0201",
      issued_at: "2026-09-01",
      due_at: "2026-10-01",
      total: 950,
      balance: 950,
      state: "awaiting_payment",
    },
    {
      id: 5500002,
      number: "INV-2026-0199",
      issued_at: "2026-08-20",
      due_at: "2026-09-20",
      total: 400,
      balance: 0,
      state: "paid",
    },
    {
      id: 5500003,
      number: "DRAFT-1",
      issued_at: "2026-09-25",
      due_at: null,
      total: 120,
      balance: 120,
      state: "draft",
    },
  ],
};

export class MockClioManageGateway implements ClioManageGateway {
  readonly isMock = true;
  async findContactsByEmail(email: string) {
    return CONTACTS.filter((c) => c.primary_email_address?.toLowerCase() === email.toLowerCase());
  }
  async listMattersForClient(clientId: number) {
    return MATTERS.filter((m) => m.client?.id === clientId);
  }
  async getMatter(matterId: number) {
    return MATTERS.find((m) => m.id === matterId) ?? null;
  }
  async listBillsForMatter(matterId: number) {
    return BILLS[matterId] ?? [];
  }
  async listWritableCalendars(): Promise<ClioCalendar[]> {
    return [{ id: 880001, name: "Cabinet (démo)", type: "AccountCalendar" }];
  }
  async createCalendarEntry(input: ClioCalendarEntryInput) {
    nextEntry += 1;
    const id = `mock-${nextEntry.toString()}`;
    ENTRIES.set(id, input);
    return id;
  }
  async updateCalendarEntry(id: string, input: ClioCalendarEntryInput) {
    if (!ENTRIES.has(id)) return false;
    ENTRIES.set(id, input);
    return true;
  }
  async deleteCalendarEntry(id: string) {
    ENTRIES.delete(id);
    GONE.add(id);
  }
  /** Mémoire du processus : une entrée inconnue (redémarrage) n'est jamais déclarée supprimée. */
  async getCalendarEntry(id: string): Promise<ClioCalendarEntryState> {
    const entry = ENTRIES.get(id);
    if (entry) return { state: "found", startAt: entry.startAt, endAt: entry.endAt, allDay: entry.allDay };
    return GONE.has(id) ? { state: "gone" } : { state: "unknown" };
  }
}

/** Entrées de calendrier du faux Clio (mémoire du processus, données fictives). */
const ENTRIES = new Map<string, ClioCalendarEntryInput>();
let nextEntry = 0;
const GONE = new Set<string>();
