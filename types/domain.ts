/**
 * Types métier — alignés sur docs/class-diagram.md (entités de domaine).
 * Dérivés de types/database.ts (généré) : toute évolution du schéma se
 * répercute ici à la compilation.
 *
 * Montants (AGENTS.md §5) : PostgREST renvoie les `numeric` en nombre JSON,
 * d'où `number` dans les types générés. Côté métier, un montant est TOUJOURS
 * une chaîne décimale (`Money`) : les services lisent ces colonnes en texte
 * (`amount_total::text`) et ne font jamais de calcul flottant.
 */
import { Constants, type Enums, type Tables } from "./database";

// ---------------------------------------------------------------------------
// Énumérations (mêmes valeurs que les types PostgreSQL — vérifié par Vitest)
// ---------------------------------------------------------------------------
export type AppRole = Enums<"app_role">;
export type UserStatus = Enums<"user_status">;
export type AccessLevel = Enums<"access_level">;
export type MatterStatus = Enums<"matter_status">;
export type TeamRole = Enums<"team_role">;
export type DocumentStatus = Enums<"document_status">;
export type DocumentFolder = Enums<"document_folder">;
export type DocumentProvider = Enums<"document_provider">;
export type ScanStatus = Enums<"scan_status">;
export type RequestStatus = Enums<"request_status">;
export type InvoiceStatus = Enums<"invoice_status">;
export type PaymentStatus = Enums<"payment_status">;
export type SignatureStatus = Enums<"signature_status">;
export type NotificationType = Enums<"notification_type">;
export type NotificationPriority = Enums<"notification_priority">;
export type InvitationStatus = Enums<"invitation_status">;

export const enumValues = Constants.public.Enums;

/** Chaîne décimale à 2 décimales, ex. « 1250.00 ». Jamais de `number`. */
export type Money = string & { readonly __brand: "Money" };
export type Locale = "en" | "fr";

/** Visibles côté client (docs/sharepoint-integration.md §3). */
export const CLIENT_VISIBLE_FOLDERS = [
  "shared",
  "client_upload",
  "signed",
] as const satisfies readonly DocumentFolder[];

// ---------------------------------------------------------------------------
// Entités (lignes de tables publiques)
// ---------------------------------------------------------------------------
export type Profile = Tables<"profiles">;
export type Organization = Tables<"organizations">;
export type OrganizationMember = Tables<"organization_members">;
export type ExternalAccount = Tables<"external_accounts">;
export type ClientInvitation = Omit<Tables<"client_invitations">, "token_hash">; // le hachage ne sort jamais du serveur
export type ClientInvitationMatter = Tables<"client_invitation_matters">;
export type NotificationPreferences = Tables<"notification_preferences">;

export type Matter = Tables<"matters">;
export type MatterTeamMember = Tables<"matter_team">;
export type MatterAccess = Tables<"matter_access">;
export type MatterTimelineStep = Tables<"matter_timeline_steps">;
export type Appointment = Tables<"appointments">;

export type Document = Tables<"documents">;
export type DocumentRequest = Tables<"document_requests">;

export type Conversation = Tables<"conversations">;
export type ConversationParticipant = Tables<"conversation_participants">;
export type Message = Tables<"messages">;
export type MessageAttachment = Tables<"message_attachments">;

export type Invoice = Omit<Tables<"invoices">, "amount_total" | "balance_due"> & {
  amount_total: Money;
  balance_due: Money;
};
export type Payment = Omit<Tables<"payments">, "amount"> & { amount: Money };
export type SignatureRequest = Tables<"signature_requests">;

export type Notification = Tables<"notifications">;

/** Compteurs du tableau de bord (RPC client_dashboard_counts). */
export type DashboardCounts = {
  activeMatters: number;
  pendingDocuments: number;
  unreadMessages: number;
  outstandingBalance: Money;
};

// ---------------------------------------------------------------------------
// Règles métier pures (miroir des méthodes du diagramme de classes)
// ---------------------------------------------------------------------------
export const isAccessActive = (access: Pick<MatterAccess, "revoked_at">): boolean =>
  access.revoked_at === null;

export const canWrite = (access: Pick<MatterAccess, "revoked_at" | "access_level">): boolean =>
  isAccessActive(access) && access.access_level === "read_write";

export const isVisibleToClient = (doc: Pick<Document, "folder" | "scan_status" | "deleted_at">): boolean =>
  (CLIENT_VISIBLE_FOLDERS as readonly string[]).includes(doc.folder) &&
  (doc.scan_status === "clean" || doc.scan_status === "not_required") &&
  doc.deleted_at === null;

export const isStale = (lastSyncedAt: string | null, maxAgeMs: number, now: Date = new Date()): boolean =>
  lastSyncedAt === null || now.getTime() - new Date(lastSyncedAt).getTime() > maxAgeMs;
