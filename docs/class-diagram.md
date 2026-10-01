# Diagramme de classes — Portail Client Lex Canada (v2.1)

> **Fichier généré, ne pas modifier à la main.** Source : `diagrams/generate_class_diagram.py`
> (`python3 diagrams/generate_class_diagram.py`). Version éditable : `diagrams/class-diagram-v2.drawio`
> (à ouvrir dans app.diagrams.net). Remplace `docs/archive/class-diagram-v1.md`.

Le diagramme couvre quatre couches :
1. les **entités de domaine**, alignées 1:1 sur `supabase/schema.sql`. Elles servent de base aux types TypeScript (`types/domain.ts`) ;
2. les **services applicatifs**, côté serveur uniquement (`server/services/`) ;
3. les **passerelles et fournisseurs** : des interfaces avec une implémentation réelle **et** une implémentation fictive (mock) ;
4. les **énumérations**, identiques aux types `enum` de PostgreSQL.

```mermaid
classDiagram
  direction LR
  %% ==================== IDENTITÉ ET ACCÈS ====================
  class Profile {
    +id: UUID
    +email: string
    +firstName: string
    +lastName: string
    +preferredLanguage: Locale
    +phone: string
    +role: AppRole
    +status: UserStatus
    +clientNumber: string
    +title: string
    +lastSeenAt: DateTime
    +createdAt: DateTime
    +updatedAt: DateTime
    +fullName(): string
    +isStaff(): bool
    +isActive(): bool
  }
  class Organization {
    +id: UUID
    +name: string
    +type: OrgType
    +clioContactId: string
    +createdAt: DateTime
    +updatedAt: DateTime
  }
  class OrganizationMember {
    +organizationId: UUID
    +userId: UUID
    +role: OrgMemberRole
    +createdAt: DateTime
  }
  class ExternalAccount {
    +id: UUID
    +userId: UUID
    +provider: ExternalProvider
    +externalId: string
    +externalRegion: string
    +metadata: Json
    +createdAt: DateTime
  }
  class ClientInvitation {
    +id: UUID
    +email: string
    +firstName: string
    +lastName: string
    +preferredLanguage: Locale
    +clioContactId: string
    +organizationId: UUID
    -tokenHash: string
    +status: InvitationStatus
    +invitedBy: UUID
    +expiresAt: DateTime
    +acceptedAt: DateTime
    +acceptedUserId: UUID
    +revokedAt: DateTime
    +createdAt: DateTime
    +isExpired(): bool
  }
  class ClientInvitationMatter {
    +invitationId: UUID
    +matterId: UUID
    +accessLevel: AccessLevel
  }
  class NotificationPreferences {
    +userId: UUID
    +emailEnabled: bool
    +smsEnabled: bool
    +inAppEnabled: bool
    +updatedAt: DateTime
  }
  %% ==================== DOSSIERS ====================
  class Matter {
    +id: UUID
    +clioMatterId: string
    +displayNumber: string
    +title: string
    +description: string
    +practiceArea: string
    +status: MatterStatus
    +progressPercent: int
    +responsibleStaffId: UUID
    +responsibleName: string
    +openedAt: Date
    +closedAt: Date
    +isMock: bool
    +lastSyncedAt: DateTime
    +purgedAt: DateTime
    +createdAt: DateTime
    +updatedAt: DateTime
    +isStale(maxAge): bool
    +isClosed(): bool
  }
  class MatterTeamMember {
    +matterId: UUID
    +userId: UUID
    +role: TeamRole
    +createdAt: DateTime
  }
  class MatterAccess {
    +id: UUID
    +matterId: UUID
    +userId: UUID
    +accessLevel: AccessLevel
    +grantedBy: UUID
    +grantedAt: DateTime
    +revokedAt: DateTime
    +revokedBy: UUID
    +revokeReason: string
    +isActive(): bool
    +canWrite(): bool
  }
  class MatterTimelineStep {
    +id: UUID
    +matterId: UUID
    +position: int
    +title: string
    +description: string
    +isCompleted: bool
    +completedAt: DateTime
  }
  class Appointment {
    +id: UUID
    +clioCalendarEntryId: string
    +matterId: UUID
    +title: string
    +description: string
    +startsAt: DateTime
    +endsAt: DateTime
    +timezone: string
    +location: string
    +meetingUrl: string
    +withStaffName: string
    +status: AppointmentStatus
    +lastSyncedAt: DateTime
  }
  %% ==================== DOCUMENTS ====================
  class Document {
    +id: UUID
    +matterId: UUID
    +provider: DocumentProvider
    +externalDriveId: string
    +externalItemId: string
    +externalEtag: string
    +folder: DocumentFolder
    -storagePath: string
    +displayName: string
    +category: string
    +status: DocumentStatus
    +scanStatus: ScanStatus
    +mimeType: string
    +sizeBytes: long
    +sha256: string
    +uploadedBy: UUID
    +uploadedAt: DateTime
    +deletedAt: DateTime
    +lastSyncedAt: DateTime
    +isVisibleToClient(): bool
  }
  class DocumentRequest {
    +id: UUID
    +matterId: UUID
    +requestedFrom: UUID
    +requestedBy: UUID
    +title: string
    +description: string
    +dueDate: Date
    +status: RequestStatus
    +fulfilledDocumentId: UUID
    +fulfilledAt: DateTime
    +isOverdue(today): bool
  }
  %% ==================== MESSAGERIE ====================
  class Conversation {
    +id: UUID
    +matterId: UUID
    +scope: ConversationScope
    +subject: string
    +createdBy: UUID
    +lastMessageAt: DateTime
    +closedAt: DateTime
    +createdAt: DateTime
    +isOpen(): bool
  }
  class ConversationParticipant {
    +conversationId: UUID
    +userId: UUID
    +lastReadAt: DateTime
    +addedAt: DateTime
    +unreadCount(messages): int
  }
  class Message {
    +id: UUID
    +conversationId: UUID
    +senderId: UUID
    +body: string
    +createdAt: DateTime
  }
  class MessageAttachment {
    +messageId: UUID
    +documentId: UUID
  }
  %% ==================== FACTURATION ET SIGNATURE ====================
  class Invoice {
    +id: UUID
    +clioBillId: string
    +matterId: UUID
    +invoiceNumber: string
    +issuedAt: Date
    +dueAt: Date
    +amountTotal: Money
    +balanceDue: Money
    +currency: string
    +status: InvoiceStatus
    +clioState: string
    +lastSyncedAt: DateTime
    +isPayable(): bool
  }
  class Payment {
    +id: UUID
    +invoiceId: UUID
    +payerId: UUID
    +provider: PaymentProviderName
    +providerReference: string
    +idempotencyKey: string
    +amount: Money
    +currency: string
    +status: PaymentStatus
    +failureCode: string
    +succeededAt: DateTime
  }
  class SignatureRequest {
    +id: UUID
    +matterId: UUID
    +documentId: UUID
    +signerId: UUID
    +requestedBy: UUID
    +provider: SignatureProviderName
    +providerEnvelopeId: string
    +status: SignatureStatus
    +dueAt: DateTime
    +sentAt: DateTime
    +viewedAt: DateTime
    +signedAt: DateTime
  }
  %% ==================== NOTIFICATIONS ====================
  class Notification {
    +id: UUID
    +userId: UUID
    +type: NotificationType
    +priority: NotificationPriority
    +title: string
    +body: string
    +matterId: UUID
    +referenceType: string
    +referenceId: UUID
    +actionUrl: string
    +readAt: DateTime
    +emailedAt: DateTime
    +createdAt: DateTime
    +markRead(): void
  }
  %% ==================== INTÉGRATION ET AUDIT (SCHÉMAS PRIVATE / AUDIT) ====================
  class AuditEvent {
    +id: bigint
    +occurredAt: DateTime
    +actorId: UUID
    +actorRole: AppRole
    +actorEmail: string
    +action: AuditAction
    +resourceType: string
    +resourceId: string
    +matterId: UUID
    +ipAddress: inet
    +userAgent: string
    +requestId: string
    +metadata: Json
  }
  class MatterStorageFolder {
    +matterId: UUID
    -siteId: string
    -driveId: string
    -rootItemId: string
    -sharedItemId: string
    -clientUploadItemId: string
    -signedItemId: string
    -webUrl: string
    +createdAt: DateTime
    +folderFor(DocumentFolder): string
  }
  class GraphDeltaState {
    +driveId: string
    -deltaLink: string
    +lastRunAt: DateTime
    +lastError: string
  }
  class GraphSubscription {
    +id: UUID
    +subscriptionId: string
    +resource: string
    +changeType: string
    -clientStateHash: string
    +expiresAt: DateTime
    +renewedAt: DateTime
    +needsRenewal(now): bool
  }
  class IntegrationConnection {
    +id: UUID
    +provider: IntegrationProvider
    +region: string
    +status: IntegrationStatus
    -vaultSecretId: UUID
    +scopes: string[]
    +connectedBy: UUID
    +connectedAt: DateTime
    +lastSyncAt: DateTime
    +lastError: string
  }
  class SyncJob {
    +id: UUID
    +provider: IntegrationProvider
    +resourceType: SyncResourceType
    +resourceId: string
    +status: SyncStatus
    +attempts: int
    +maxAttempts: int
    +runAfter: DateTime
    +lockedAt: DateTime
    +lockedBy: string
    +errorCode: string
    +startedAt: DateTime
    +completedAt: DateTime
  }
  class WebhookEvent {
    +id: UUID
    +provider: IntegrationProvider
    +externalEventId: string
    +resourceType: string
    +resourceId: string
    +signatureValid: bool
    +status: WebhookStatus
    +error: string
    +receivedAt: DateTime
    +processedAt: DateTime
  }
  %% ==================== SERVICES APPLICATIFS (SERVEUR UNIQUEMENT) ====================
  class AccessControlService {
    <<service>>
    -db: SupabaseServerClient
    +requireUser(): Profile
    +requireRole(roles): Profile
    +canReadMatter(userId, matterId): bool
    +canWriteMatter(userId, matterId): bool
    +assertMatterAccess(userId, matterId, level): void
    +grantAccess(matterId, userId, level, grantedBy): MatterAccess
    +revokeAccess(accessId, revokedBy, reason): void
  }
  class InvitationService {
    <<service>>
    -db: SupabaseServiceClient
    -notifier: NotificationProvider
    +invite(input, invitedBy): ClientInvitation
    +accept(token, password): Profile
    +revoke(invitationId, by): void
    +expireStale(): int
  }
  class AuditService {
    <<service>>
    -db: SupabaseServiceClient
    +record(action, resourceType, resourceId, matterId, metadata, ctx): void
  }
  class MatterService {
    <<service>>
    -access: AccessControlService
    -clio: ClioManageGateway
    +listForUser(userId): Matter[]
    +getDetail(userId, matterId): MatterDetail
    +getTimeline(userId, matterId): MatterTimelineStep[]
  }
  class DocumentService {
    <<service>>
    -access: AccessControlService
    -store: DocumentStore
    -scanner: MalwareScanner
    -audit: AuditService
    +list(userId, matterId): Document[]
    +upload(userId, matterId, file): Document
    +streamDownload(userId, documentId): FileStream
    +streamPreview(userId, documentId): FileStream
    +syncFromStore(driveId): int
    +handleGraphNotification(payload): void
  }
  class MessagingService {
    <<service>>
    -access: AccessControlService
    -notifier: NotificationProvider
    +listConversations(userId): Conversation[]
    +startConversation(userId, matterId, subject): Conversation
    +send(userId, conversationId, body, attachments): Message
    +markRead(userId, conversationId): void
  }
  class BillingService {
    <<service>>
    -access: AccessControlService
    -payments: PaymentProvider
    +listInvoices(userId, matterId): Invoice[]
    +startPayment(userId, invoiceId): PaymentLink
    +handlePaymentWebhook(payload, signature): void
  }
  class SyncService {
    <<service>>
    -clio: ClioManageGateway
    -db: SupabaseServiceClient
    +enqueue(provider, resourceType, resourceId): SyncJob
    +runDueJobs(limit): int
    +syncMatter(clioMatterId): void
    +handleClioWebhook(payload, signature): void
  }
  %% ==================== PASSERELLES ET FOURNISSEURS (INTERFACES + IMPLÉMENTATIONS) ====================
  class ClioManageGateway {
    <<interface>>
    +listMatters(contactId): ClioMatter[]
    +getMatter(id): ClioMatter
    +listCalendarEntries(matterId): ClioCalendarEntry[]
    +listBills(matterId): ClioBill[]
    +listDocuments(matterId): ClioDocument[]
    +verifyWebhook(payload, signature): bool
  }
  class ClioManageClient {
    -baseUrl: string
    -tokens: OAuthTokenStore
    -rateLimiter: RateLimiter
  }
  class MockClioManageGateway {
    -fixtures: MockData
  }
  class DocumentStore {
    <<interface>>
    +ensureMatterFolder(matter): MatterStorageFolder
    +upload(folder, file, metadata): StoredRef
    +openContent(ref, format?): FileStream
    +delta(driveId, deltaLink?): DeltaPage
    +subscribe(driveId): GraphSubscription
    +renew(subscription): GraphSubscription
    +verifyNotification(payload, clientState): bool
  }
  class SharePointDocumentStore {
    -graph: GraphClient
    -siteId: string
    -driveId: string
  }
  class GraphClient {
    -baseUrl: string
    -credential: CertificateCredential
    -retry: RetryPolicy
    +get(path): Json
    +post(path, body): Json
    +put(path, stream): Json
    +createUploadSession(path): UploadSession
    +getStream(path): FileStream
  }
  class MockDocumentStore {
  }
  class MalwareScanner {
    <<interface>>
    +scan(object): ScanStatus
  }
  class MockMalwareScanner {
  }
  class PaymentProvider {
    <<interface>>
    +createPaymentLink(invoice, payer): PaymentLink
    +getStatus(reference): PaymentStatus
    +verifyWebhook(payload, signature): bool
  }
  class ClioPaymentsProvider {
  }
  class StripePaymentProvider {
  }
  class MockPaymentProvider {
  }
  class SignatureProvider {
    <<interface>>
    +createEnvelope(document, signer): SignatureRequest
    +getStatus(envelopeId): SignatureStatus
    +verifyWebhook(payload, signature): bool
  }
  class DocuSignProvider {
  }
  class MockSignatureProvider {
  }
  class NotificationProvider {
    <<interface>>
    +send(userId, notification): void
  }
  class InAppNotificationProvider {
  }
  class EmailNotificationProvider {
  }
  class OAuthTokenStore {
    <<interface>>
    +get(provider, region): OAuthTokens
    +save(provider, region, tokens): void
    +refreshIfExpired(provider, region): OAuthTokens
  }
  class VaultTokenStore {
  }
  %% ==================== ÉNUMÉRATIONS ====================
  class AppRole {
    <<enumeration>>
    client
    staff
    firm_admin
  }
  class UserStatus {
    <<enumeration>>
    invited
    active
    suspended
    deactivated
  }
  class AccessLevel {
    <<enumeration>>
    read
    read_write
  }
  class MatterStatus {
    <<enumeration>>
    open
    action_required
    on_hold
    closed
  }
  class TeamRole {
    <<enumeration>>
    responsible
    originating
    collaborator
    assistant
  }
  class DocumentStatus {
    <<enumeration>>
    uploaded
    in_review
    accepted
    rejected
    pending_signature
    signed
  }
  class ScanStatus {
    <<enumeration>>
    pending
    clean
    infected
    failed
    not_required
  }
  class DocumentFolder {
    <<enumeration>>
    shared
    client_upload
    signed
    internal
  }
  class DocumentProvider {
    <<enumeration>>
    sharepoint
    clio
    supabase_storage
    imanage
  }
  class RequestStatus {
    <<enumeration>>
    pending
    fulfilled
    overdue
    cancelled
  }
  class InvoiceStatus {
    <<enumeration>>
    due
    overdue
    paid
    void
  }
  class PaymentStatus {
    <<enumeration>>
    pending
    processing
    succeeded
    failed
    refunded
    cancelled
  }
  class SignatureStatus {
    <<enumeration>>
    to_sign
    sent
    viewed
    signed
    declined
    expired
  }
  class NotificationPriority {
    <<enumeration>>
    urgent
    info
    success
  }
  class InvitationStatus {
    <<enumeration>>
    pending
    accepted
    expired
    revoked
  }
  %% ==================== RELATIONS ====================
  Profile "1" --> "*" OrganizationMember
  Organization "1" *-- "*" OrganizationMember
  Profile "1" *-- "*" ExternalAccount
  Profile "1" *-- "1" NotificationPreferences
  Profile "1" --> "*" MatterAccess : client
  Profile "1" --> "*" MatterTeamMember : personnel
  Profile "1" --> "*" Notification : reçoit
  ClientInvitation "1" *-- "*" ClientInvitationMatter
  Matter "1" --> "*" ClientInvitationMatter
  Matter "1" --> "*" MatterAccess
  Matter "1" --> "*" MatterTeamMember
  Matter "1" *-- "*" MatterTimelineStep
  Matter "1" *-- "*" Appointment
  Matter "1" *-- "*" Document
  Matter "1" *-- "*" DocumentRequest
  Matter "1" *-- "*" Conversation
  Matter "1" *-- "*" Invoice
  Matter "1" *-- "*" SignatureRequest
  Conversation "1" *-- "*" ConversationParticipant
  Conversation "1" *-- "*" Message
  Message "1" *-- "*" MessageAttachment
  MessageAttachment "*" --> "1" Document
  DocumentRequest "0..1" --> "0..1" Document : satisfaite par
  SignatureRequest "*" --> "1" Document : porte sur
  Invoice "1" *-- "*" Payment
  ClioManageClient ..|> ClioManageGateway
  MockClioManageGateway ..|> ClioManageGateway
  SharePointDocumentStore ..|> DocumentStore
  SharePointDocumentStore ..> GraphClient : utilise
  SharePointDocumentStore ..> MatterStorageFolder : crée
  SharePointDocumentStore ..> GraphDeltaState : met à jour
  SharePointDocumentStore ..> GraphSubscription : renouvelle
  Matter "1" --> "0..1" MatterStorageFolder : emplacement SharePoint
  MockDocumentStore ..|> DocumentStore
  MockMalwareScanner ..|> MalwareScanner
  ClioPaymentsProvider ..|> PaymentProvider
  StripePaymentProvider ..|> PaymentProvider
  MockPaymentProvider ..|> PaymentProvider
  DocuSignProvider ..|> SignatureProvider
  MockSignatureProvider ..|> SignatureProvider
  InAppNotificationProvider ..|> NotificationProvider
  EmailNotificationProvider ..|> NotificationProvider
  VaultTokenStore ..|> OAuthTokenStore
  ClioManageClient ..> OAuthTokenStore : utilise
  AccessControlService ..> MatterAccess : gère
  InvitationService ..> ClientInvitation : gère
  AuditService ..> AuditEvent : écrit
  MatterService ..> AccessControlService : vérifie d'abord
  DocumentService ..> AccessControlService : vérifie d'abord
  DocumentService ..> DocumentStore
  DocumentService ..> MalwareScanner
  MessagingService ..> AccessControlService : vérifie d'abord
  BillingService ..> AccessControlService : vérifie d'abord
  BillingService ..> PaymentProvider
  SyncService ..> ClioManageGateway
  SyncService ..> SyncJob : produit
  SyncService ..> WebhookEvent : trace
  SyncService ..> Matter : alimente (cache)
```

## Règles de conception

| Règle | Conséquence dans le code |
|---|---|
| Chaque intégration externe est une **interface** | `ClioManageGateway`, `DocumentStore`, `MalwareScanner`, `PaymentProvider`, `SignatureProvider`, `NotificationProvider`, `OAuthTokenStore`. Le choix de l'implémentation se fait dans `server/providers/index.ts`, selon des variables d'environnement. |
| **Mock par défaut** | Tant qu'un fournisseur n'est pas confirmé (voir `open-questions.md`), seule l'implémentation `Mock*` est instanciée. Elle est signalée dans l'interface (badge « Données de démonstration »). |
| **Vérification d'accès d'abord** | Tout service appelle `AccessControlService.assertMatterAccess()` **avant** d'appeler une passerelle. La RLS refait la vérification en base (défense en profondeur). |
| **Serveur uniquement** | Les services et passerelles importent `server-only` et ne sont jamais importés par un composant client. |
| **Validation Zod** | Toute réponse Clio, Graph, DocuSign ou de paiement est validée par un schéma Zod dans `server/providers/<fournisseur>/schemas.ts` avant d'être utilisée. |
| **Montants** | Le type `Money` est un `string` décimal côté TypeScript (aucun `number` flottant), et un `numeric(12,2)` en base. |

## Correspondance avec la base de données

| Classe | Table | Schéma |
|---|---|---|
| Profile | `profiles` | public |
| Organization / OrganizationMember | `organizations` / `organization_members` | public |
| ExternalAccount | `external_accounts` | public |
| ClientInvitation / ClientInvitationMatter | `client_invitations` / `client_invitation_matters` | public |
| NotificationPreferences | `notification_preferences` | public |
| Matter / MatterTeamMember / MatterAccess | `matters` / `matter_team` / `matter_access` | public |
| MatterTimelineStep / Appointment | `matter_timeline_steps` / `appointments` | public |
| Document / DocumentRequest | `documents` / `document_requests` | public |
| Conversation / ConversationParticipant / Message / MessageAttachment | `conversations` / `conversation_participants` / `messages` / `message_attachments` | public |
| Invoice / Payment / SignatureRequest | `invoices` / `payments` / `signature_requests` | public |
| Notification | `notifications` | public |
| MatterStorageFolder / GraphDeltaState / GraphSubscription | `matter_storage_folders` / `graph_delta_state` / `graph_subscriptions` | **private** |
| IntegrationConnection / SyncJob / WebhookEvent | `integration_connections` / `sync_jobs` / `webhook_events` | **private** |
| AuditEvent | `events` | **audit** |
