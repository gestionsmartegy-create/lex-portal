/**
 * Types de lecture du portail (lignes renvoyées par les services, colonnes explicites).
 * Ici, et non dans server/, pour que les composants puissent les utiliser sans importer
 * de code serveur (AGENTS.md §3).
 */
import type { DocumentFolder, DocumentStatus, InvoiceStatus, Money, ScanStatus } from "./domain";

export type DocumentRow = {
  id: string;
  matter_id: string;
  folder: DocumentFolder;
  display_name: string;
  status: DocumentStatus;
  scan_status: ScanStatus;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  matters: { display_number: string | null; is_mock: boolean } | null;
};

export type InvoiceRow = {
  id: string;
  matter_id: string;
  invoice_number: string;
  issued_at: string | null;
  due_at: string | null;
  amount_total: Money;
  balance_due: Money;
  currency: string;
  status: InvoiceStatus;
  last_synced_at: string | null;
  matters: { display_number: string | null; is_mock: boolean } | null;
};

export type AppointmentRow = {
  id: string;
  matter_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  location: string | null;
  meeting_url: string | null;
  with_staff_name: string | null;
  status: string;
  matters: { display_number: string | null; is_mock: boolean } | null;
};

export type ConversationSummary = {
  id: string;
  matter_id: string | null;
  subject: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  matters: { display_number: string | null; title: string } | null;
  lastMessage: { body: string; sender_id: string; created_at: string } | null;
  unread: boolean;
};
