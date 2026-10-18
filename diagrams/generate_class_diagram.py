#!/usr/bin/env python3
"""Génère docs/class-diagram.md (Mermaid) et diagrams/class-diagram-v2.drawio
à partir d'une source unique. Relancer après toute modification :
    python3 diagrams/generate_class_diagram.py
Source de vérité des attributs : supabase/schema.sql (garder aligné).
"""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (nom, stéréotype, couche, [attributs], [méthodes])
# Couches : identity, matter, document, messaging, billing, notification,
# admin, service, provider, enum
CLASSES = [
    # ---------------- IDENTITÉ ----------------
    ("Profile", None, "identity", [
        "+id: UUID", "+email: string", "+firstName: string", "+lastName: string",
        "+preferredLanguage: Locale", "+phone: string", "+role: AppRole", "+status: UserStatus",
        "+clientNumber: string", "+title: string", "+lastSeenAt: DateTime",
        "+createdAt: DateTime", "+updatedAt: DateTime"],
        ["+fullName(): string", "+isStaff(): bool", "+isActive(): bool"]),
    ("Organization", None, "identity", [
        "+id: UUID", "+name: string", "+type: OrgType", "+clioContactId: string",
        "+createdAt: DateTime", "+updatedAt: DateTime"], []),
    ("OrganizationMember", None, "identity", [
        "+organizationId: UUID", "+userId: UUID", "+role: OrgMemberRole", "+createdAt: DateTime"], []),
    ("ExternalAccount", None, "identity", [
        "+id: UUID", "+userId: UUID", "+provider: ExternalProvider", "+externalId: string",
        "+externalRegion: string", "+metadata: Json", "+createdAt: DateTime"], []),
    ("ClientInvitation", None, "identity", [
        "+id: UUID", "+email: string", "+firstName: string", "+lastName: string",
        "+preferredLanguage: Locale", "+clioContactId: string", "+organizationId: UUID",
        "-tokenHash: string", "+status: InvitationStatus", "+invitedBy: UUID",
        "+expiresAt: DateTime", "+acceptedAt: DateTime", "+acceptedUserId: UUID",
        "+revokedAt: DateTime", "+createdAt: DateTime"],
        ["+isExpired(): bool"]),
    ("ClientInvitationMatter", None, "identity", [
        "+invitationId: UUID", "+matterId: UUID", "+accessLevel: AccessLevel"], []),
    ("NotificationPreferences", None, "identity", [
        "+userId: UUID", "+emailEnabled: bool", "+smsEnabled: bool", "+inAppEnabled: bool",
        "+updatedAt: DateTime"], []),

    # ---------------- DOSSIERS ----------------
    ("Matter", None, "matter", [
        "+id: UUID", "+clioMatterId: string", "+displayNumber: string", "+title: string",
        "+description: string", "+practiceArea: string", "+status: MatterStatus",
        "+progressPercent: int", "+responsibleStaffId: UUID", "+responsibleName: string",
        "+openedAt: Date", "+closedAt: Date", "+isMock: bool", "+lastSyncedAt: DateTime",
        "+purgedAt: DateTime", "+createdAt: DateTime", "+updatedAt: DateTime"],
        ["+isStale(maxAge): bool", "+isClosed(): bool"]),
    ("MatterTeamMember", None, "matter", [
        "+matterId: UUID", "+userId: UUID", "+role: TeamRole", "+createdAt: DateTime"], []),
    ("MatterAccess", None, "matter", [
        "+id: UUID", "+matterId: UUID", "+userId: UUID", "+accessLevel: AccessLevel",
        "+grantedBy: UUID", "+grantedAt: DateTime", "+revokedAt: DateTime",
        "+revokedBy: UUID", "+revokeReason: string"],
        ["+isActive(): bool", "+canWrite(): bool"]),
    ("MatterTimelineStep", None, "matter", [
        "+id: UUID", "+matterId: UUID", "+position: int", "+title: string",
        "+description: string", "+isCompleted: bool", "+completedAt: DateTime"], []),
    ("Appointment", None, "matter", [
        "+id: UUID", "+clioCalendarEntryId: string", "+matterId: UUID", "+title: string",
        "+description: string", "+startsAt: DateTime", "+endsAt: DateTime",
        "+timezone: string", "+location: string", "+meetingUrl: string",
        "+withStaffName: string", "+status: AppointmentStatus", "+lastSyncedAt: DateTime"], []),

    # ---------------- DOCUMENTS ----------------
    ("Document", None, "document", [
        "+id: UUID", "+matterId: UUID", "+provider: DocumentProvider",
        "+externalDriveId: string", "+externalItemId: string", "+externalEtag: string",
        "+folder: DocumentFolder", "-storagePath: string",
        "+displayName: string", "+category: string", "+status: DocumentStatus",
        "+scanStatus: ScanStatus", "+mimeType: string", "+sizeBytes: long", "+sha256: string",
        "+uploadedBy: UUID", "+uploadedAt: DateTime",
        "+deletedAt: DateTime", "+lastSyncedAt: DateTime"],
        ["+isVisibleToClient(): bool"]),
    ("DocumentRequest", None, "document", [
        "+id: UUID", "+matterId: UUID", "+requestedFrom: UUID", "+requestedBy: UUID",
        "+title: string", "+description: string", "+dueDate: Date", "+status: RequestStatus",
        "+fulfilledDocumentId: UUID", "+fulfilledAt: DateTime"],
        ["+isOverdue(today): bool"]),

    # ---------------- MESSAGERIE ----------------
    ("Conversation", None, "messaging", [
        "+id: UUID", "+matterId: UUID", "+scope: ConversationScope", "+subject: string",
        "+createdBy: UUID", "+lastMessageAt: DateTime", "+closedAt: DateTime",
        "+createdAt: DateTime"], ["+isOpen(): bool"]),
    ("ConversationParticipant", None, "messaging", [
        "+conversationId: UUID", "+userId: UUID", "+lastReadAt: DateTime", "+addedAt: DateTime"],
        ["+unreadCount(messages): int"]),
    ("Message", None, "messaging", [
        "+id: UUID", "+conversationId: UUID", "+senderId: UUID", "+body: string",
        "+createdAt: DateTime"], []),
    ("MessageAttachment", None, "messaging", [
        "+messageId: UUID", "+documentId: UUID"], []),

    # ---------------- FACTURATION / SIGNATURE ----------------
    ("Invoice", None, "billing", [
        "+id: UUID", "+clioBillId: string", "+matterId: UUID", "+invoiceNumber: string",
        "+issuedAt: Date", "+dueAt: Date", "+amountTotal: Money", "+balanceDue: Money",
        "+currency: string", "+status: InvoiceStatus", "+clioState: string",
        "+lastSyncedAt: DateTime"], ["+isPayable(): bool"]),
    ("Payment", None, "billing", [
        "+id: UUID", "+invoiceId: UUID", "+payerId: UUID", "+provider: PaymentProviderName",
        "+providerReference: string", "+idempotencyKey: string", "+amount: Money",
        "+currency: string", "+status: PaymentStatus", "+failureCode: string",
        "+succeededAt: DateTime"], []),
    ("SignatureRequest", None, "billing", [
        "+id: UUID", "+matterId: UUID", "+documentId: UUID", "+signerId: UUID",
        "+requestedBy: UUID", "+provider: SignatureProviderName", "+providerEnvelopeId: string",
        "+status: SignatureStatus", "+dueAt: DateTime", "+sentAt: DateTime",
        "+viewedAt: DateTime", "+signedAt: DateTime"], []),

    # ---------------- NOTIFICATIONS ----------------
    ("Notification", None, "notification", [
        "+id: UUID", "+userId: UUID", "+type: NotificationType",
        "+priority: NotificationPriority", "+title: string", "+body: string",
        "+matterId: UUID", "+referenceType: string", "+referenceId: UUID",
        "+actionUrl: string", "+readAt: DateTime", "+emailedAt: DateTime",
        "+createdAt: DateTime"], ["+markRead(): void"]),

    # ---------------- ADMIN / INTÉGRATION (schémas private / audit) ----------------
    ("AuditEvent", None, "admin", [
        "+id: bigint", "+occurredAt: DateTime", "+actorId: UUID", "+actorRole: AppRole",
        "+actorEmail: string", "+action: AuditAction", "+resourceType: string",
        "+resourceId: string", "+matterId: UUID", "+ipAddress: inet", "+userAgent: string",
        "+requestId: string", "+metadata: Json"], []),
    ("MatterStorageFolder", None, "admin", [
        "+matterId: UUID", "-siteId: string", "-driveId: string", "-rootItemId: string",
        "-sharedItemId: string", "-clientUploadItemId: string", "-signedItemId: string",
        "-webUrl: string", "+createdAt: DateTime"], ["+folderFor(DocumentFolder): string"]),
    ("GraphDeltaState", None, "admin", [
        "+driveId: string", "-deltaLink: string", "+lastRunAt: DateTime", "+lastError: string"], []),
    ("GraphSubscription", None, "admin", [
        "+id: UUID", "+subscriptionId: string", "+resource: string", "+changeType: string",
        "-clientStateHash: string", "+expiresAt: DateTime", "+renewedAt: DateTime"],
        ["+needsRenewal(now): bool"]),
    ("IntegrationConnection", None, "admin", [
        "+id: UUID", "+provider: IntegrationProvider", "+region: string",
        "+status: IntegrationStatus", "-vaultSecretId: UUID", "+scopes: string[]",
        "+connectedBy: UUID", "+connectedAt: DateTime", "+lastSyncAt: DateTime",
        "+lastError: string"], []),
    ("SyncJob", None, "admin", [
        "+id: UUID", "+provider: IntegrationProvider", "+resourceType: SyncResourceType",
        "+resourceId: string", "+status: SyncStatus", "+attempts: int", "+maxAttempts: int",
        "+runAfter: DateTime", "+lockedAt: DateTime", "+lockedBy: string",
        "+errorCode: string", "+startedAt: DateTime", "+completedAt: DateTime"], []),
    ("WebhookEvent", None, "admin", [
        "+id: UUID", "+provider: IntegrationProvider", "+externalEventId: string",
        "+resourceType: string", "+resourceId: string", "+signatureValid: bool",
        "+status: WebhookStatus", "+error: string", "+receivedAt: DateTime",
        "+processedAt: DateTime"], []),

    # ---------------- SERVICES (serveur uniquement : lib/, services/) ----------------
    ("AccessControlService", "service", "service", ["-db: SupabaseServerClient"], [
        "+requireUser(): Profile", "+requireRole(roles): Profile",
        "+canReadMatter(userId, matterId): bool", "+canWriteMatter(userId, matterId): bool",
        "+assertMatterAccess(userId, matterId, level): void",
        "+grantAccess(matterId, userId, level, grantedBy): MatterAccess",
        "+revokeAccess(accessId, revokedBy, reason): void"]),
    ("InvitationService", "service", "service", ["-db: SupabaseServiceClient", "-notifier: NotificationProvider"], [
        "+invite(input, invitedBy): ClientInvitation",
        "+accept(token, password): Profile", "+revoke(invitationId, by): void",
        "+expireStale(): int"]),
    ("AuditService", "service", "service", ["-db: SupabaseServiceClient"], [
        "+record(action, resourceType, resourceId, matterId, metadata, ctx): void"]),
    ("MatterService", "service", "service", ["-access: AccessControlService", "-clio: ClioManageGateway"], [
        "+listForUser(userId): Matter[]", "+getDetail(userId, matterId): MatterDetail",
        "+getTimeline(userId, matterId): MatterTimelineStep[]"]),
    ("DocumentService", "service", "service", [
        "-access: AccessControlService", "-store: DocumentStore", "-scanner: MalwareScanner",
        "-audit: AuditService"], [
        "+list(userId, matterId): Document[]",
        "+upload(userId, matterId, file): Document",
        "+streamDownload(userId, documentId): FileStream",
        "+streamPreview(userId, documentId): FileStream",
        "+syncFromStore(driveId): int",
        "+handleGraphNotification(payload): void"]),
    ("MessagingService", "service", "service", ["-access: AccessControlService", "-notifier: NotificationProvider"], [
        "+listConversations(userId): Conversation[]",
        "+startConversation(userId, matterId, subject): Conversation",
        "+send(userId, conversationId, body, attachments): Message",
        "+markRead(userId, conversationId): void"]),
    ("BillingService", "service", "service", ["-access: AccessControlService", "-payments: PaymentProvider"], [
        "+listInvoices(userId, matterId): Invoice[]",
        "+startPayment(userId, invoiceId): PaymentLink",
        "+handlePaymentWebhook(payload, signature): void"]),
    ("SyncService", "service", "service", ["-clio: ClioManageGateway", "-db: SupabaseServiceClient"], [
        "+enqueue(provider, resourceType, resourceId): SyncJob",
        "+runDueJobs(limit): int", "+syncMatter(clioMatterId): void",
        "+handleClioWebhook(payload, signature): void"]),

    # ---------------- PASSERELLES / FOURNISSEURS (interfaces + implémentations) ----------------
    ("ClioManageGateway", "interface", "provider", [], [
        "+listMatters(contactId): ClioMatter[]", "+getMatter(id): ClioMatter",
        "+listCalendarEntries(matterId): ClioCalendarEntry[]", "+listBills(matterId): ClioBill[]",
        "+listDocuments(matterId): ClioDocument[]", "+verifyWebhook(payload, signature): bool",
        "+createCalendarEntry(input): string", "+updateCalendarEntry(id, input): bool",
        "+deleteCalendarEntry(id): void", "+getCalendarEntry(id): ClioCalendarEntryState"]),
    ("ClioManageClient", None, "provider", [
        "-baseUrl: string = https://ca.app.clio.com/api/v4", "-tokens: OAuthTokenStore",
        "-rateLimiter: RateLimiter"], ["(implémente ClioManageGateway)"]),
    ("MockClioManageGateway", None, "provider", ["-fixtures: MockData"], ["(implémente ClioManageGateway)"]),
    ("OutlookCalendarGateway", "interface", "provider", [], [
        "+getBusyBlocks(userId, from, to): BusyBlock[]",
        "+ensureReminderCalendar(userId, knownId): string",
        "+upsertReminder(userId, calendarId, eventId, input): string",
        "+deleteReminder(userId, eventId): void"]),
    ("MockOutlookCalendarGateway", None, "provider", ["-agenda fictif stable par personne"],
     ["(implémente OutlookCalendarGateway)"]),
    ("CalendarConnectionService", "service", "service", ["-outlook: OutlookCalendarGateway", "-db: SupabaseServiceClient"], [
        "+connectMyCalendar(): Result", "+disconnectCalendar(userId): Result",
        "+setMyReminders(enabled): Result", "+syncOutlookCalendars(): Summary"]),
    ("AiDraftingGateway", "interface", "provider", [], ["+assist(kind, language, maskedText, instruction): string"]),
    ("MockAiDraftingGateway", None, "provider", ["-propositions fixes marquées « Simulateur »"],
     ["(implémente AiDraftingGateway)"]),
    ("ContractService", "service", "service", ["-db: SupabaseServerClient (RLS)", "-ai: AiDraftingGateway"], [
        "+listContracts(filters, matterId?): ContractRow[]", "+createContract(input): uuid",
        "+getContract(id): ContractEditorData", "+saveSection(id, sectionId, json): Result",
        "+acquireLock(id) / releaseLock(id)", "+saveVersion(id, label) / restoreVersion(id, v)",
        "+aiAssist(contractId, sectionId, kind, instruction): Proposal"]),
    ("DocumentStore", "interface", "provider", [], [
        "+ensureMatterFolder(matter): MatterStorageFolder",
        "+upload(folder, file, metadata): StoredRef",
        "+openContent(ref, format?): FileStream",
        "+delta(driveId, deltaLink?): DeltaPage",
        "+subscribe(driveId): GraphSubscription", "+renew(subscription): GraphSubscription",
        "+verifyNotification(payload, clientState): bool"]),
    ("SharePointDocumentStore", None, "provider", [
        "-graph: GraphClient", "-siteId: string", "-driveId: string"], ["(implémente DocumentStore)"]),
    ("GraphClient", None, "provider", [
        "-baseUrl: string = https://graph.microsoft.com/v1.0", "-credential: CertificateCredential",
        "-retry: RetryPolicy"], [
        "+get(path): Json", "+post(path, body): Json", "+put(path, stream): Json",
        "+createUploadSession(path): UploadSession", "+getStream(path): FileStream"]),
    ("MockDocumentStore", None, "provider", [], ["(implémente DocumentStore)"]),
    ("MalwareScanner", "interface", "provider", [], ["+scan(object): ScanStatus"]),
    ("MockMalwareScanner", None, "provider", [], ["(implémente MalwareScanner)"]),
    ("PaymentProvider", "interface", "provider", [], [
        "+createPaymentLink(invoice, payer): PaymentLink", "+getStatus(reference): PaymentStatus",
        "+verifyWebhook(payload, signature): bool"]),
    ("ClioPaymentsProvider", None, "provider", [], ["(implémente PaymentProvider)"]),
    ("StripePaymentProvider", None, "provider", [], ["(implémente PaymentProvider)"]),
    ("MockPaymentProvider", None, "provider", [], ["(implémente PaymentProvider)"]),
    ("SignatureProvider", "interface", "provider", [], [
        "+createEnvelope(document, signer): SignatureRequest", "+getStatus(envelopeId): SignatureStatus",
        "+verifyWebhook(payload, signature): bool"]),
    ("DocuSignProvider", None, "provider", [], ["(implémente SignatureProvider)"]),
    ("MockSignatureProvider", None, "provider", [], ["(implémente SignatureProvider)"]),
    ("NotificationProvider", "interface", "provider", [], ["+send(userId, notification): void"]),
    ("InAppNotificationProvider", None, "provider", [], ["(implémente NotificationProvider)"]),
    ("EmailNotificationProvider", None, "provider", [], ["(implémente NotificationProvider)"]),
    ("OAuthTokenStore", "interface", "provider", [], [
        "+get(provider, region): OAuthTokens", "+save(provider, region, tokens): void",
        "+refreshIfExpired(provider, region): OAuthTokens"]),
    ("VaultTokenStore", None, "provider", [], ["(implémente OAuthTokenStore — Supabase Vault ou Azure Key Vault)"]),
]

ENUMS = [
    ("AppRole", ["client", "staff", "firm_admin"]),
    ("UserStatus", ["invited", "active", "suspended", "deactivated"]),
    ("AccessLevel", ["read", "read_write"]),
    ("MatterStatus", ["open", "action_required", "on_hold", "closed"]),
    ("TeamRole", ["responsible", "originating", "collaborator", "assistant"]),
    ("DocumentStatus", ["uploaded", "in_review", "accepted", "rejected", "pending_signature", "signed"]),
    ("ScanStatus", ["pending", "clean", "infected", "failed", "not_required"]),
    ("DocumentFolder", ["shared", "client_upload", "signed", "internal"]),
    ("DocumentProvider", ["sharepoint", "clio", "supabase_storage", "imanage"]),
    ("RequestStatus", ["pending", "fulfilled", "overdue", "cancelled"]),
    ("InvoiceStatus", ["due", "overdue", "paid", "void"]),
    ("PaymentStatus", ["pending", "processing", "succeeded", "failed", "refunded", "cancelled"]),
    ("SignatureStatus", ["to_sign", "sent", "viewed", "signed", "declined", "expired"]),
    ("NotificationPriority", ["urgent", "info", "success"]),
    ("InvitationStatus", ["pending", "accepted", "expired", "revoked"]),
]

# (source, cardinalité source, cible, cardinalité cible, type, libellé)
# type : assoc | compose | realize | depend
RELATIONS = [
    ("Profile", "1", "OrganizationMember", "*", "assoc", ""),
    ("Organization", "1", "OrganizationMember", "*", "compose", ""),
    ("Profile", "1", "ExternalAccount", "*", "compose", ""),
    ("Profile", "1", "NotificationPreferences", "1", "compose", ""),
    ("Profile", "1", "MatterAccess", "*", "assoc", "client"),
    ("Profile", "1", "MatterTeamMember", "*", "assoc", "personnel"),
    ("Profile", "1", "Notification", "*", "assoc", "reçoit"),
    ("ClientInvitation", "1", "ClientInvitationMatter", "*", "compose", ""),
    ("Matter", "1", "ClientInvitationMatter", "*", "assoc", ""),
    ("Matter", "1", "MatterAccess", "*", "assoc", ""),
    ("Matter", "1", "MatterTeamMember", "*", "assoc", ""),
    ("Matter", "1", "MatterTimelineStep", "*", "compose", ""),
    ("Matter", "1", "Appointment", "*", "compose", ""),
    ("Matter", "1", "Document", "*", "compose", ""),
    ("Matter", "1", "DocumentRequest", "*", "compose", ""),
    ("Matter", "1", "Conversation", "*", "compose", ""),
    ("Matter", "1", "Invoice", "*", "compose", ""),
    ("Matter", "1", "SignatureRequest", "*", "compose", ""),
    ("Conversation", "1", "ConversationParticipant", "*", "compose", ""),
    ("Conversation", "1", "Message", "*", "compose", ""),
    ("Message", "1", "MessageAttachment", "*", "compose", ""),
    ("MessageAttachment", "*", "Document", "1", "assoc", ""),
    ("DocumentRequest", "0..1", "Document", "0..1", "assoc", "satisfaite par"),
    ("SignatureRequest", "*", "Document", "1", "assoc", "porte sur"),
    ("Invoice", "1", "Payment", "*", "compose", ""),
    ("ClioManageClient", "", "ClioManageGateway", "", "realize", ""),
    ("MockClioManageGateway", "", "ClioManageGateway", "", "realize", ""),
    ("MockOutlookCalendarGateway", "", "OutlookCalendarGateway", "", "realize", ""),
    ("CalendarConnectionService", "", "OutlookCalendarGateway", "", "depend", "plages occupées, rappels"),
    ("CalendarConnectionService", "", "OAuthTokenStore", "", "depend", "jetons (Vault)"),
    ("MockAiDraftingGateway", "", "AiDraftingGateway", "", "realize", ""),
    ("ContractService", "", "AiDraftingGateway", "", "depend", "texte masqué"),
    ("ContractService", "", "AccessControlService", "", "depend", "vérifie d'abord (dossier lié)"),
    ("SharePointDocumentStore", "", "DocumentStore", "", "realize", ""),
    ("SharePointDocumentStore", "", "GraphClient", "", "depend", "utilise"),
    ("SharePointDocumentStore", "", "MatterStorageFolder", "", "depend", "crée"),
    ("SharePointDocumentStore", "", "GraphDeltaState", "", "depend", "met à jour"),
    ("SharePointDocumentStore", "", "GraphSubscription", "", "depend", "renouvelle"),
    ("Matter", "1", "MatterStorageFolder", "0..1", "assoc", "emplacement SharePoint"),
    ("MockDocumentStore", "", "DocumentStore", "", "realize", ""),
    ("MockMalwareScanner", "", "MalwareScanner", "", "realize", ""),
    ("ClioPaymentsProvider", "", "PaymentProvider", "", "realize", ""),
    ("StripePaymentProvider", "", "PaymentProvider", "", "realize", ""),
    ("MockPaymentProvider", "", "PaymentProvider", "", "realize", ""),
    ("DocuSignProvider", "", "SignatureProvider", "", "realize", ""),
    ("MockSignatureProvider", "", "SignatureProvider", "", "realize", ""),
    ("InAppNotificationProvider", "", "NotificationProvider", "", "realize", ""),
    ("EmailNotificationProvider", "", "NotificationProvider", "", "realize", ""),
    ("VaultTokenStore", "", "OAuthTokenStore", "", "realize", ""),
    ("ClioManageClient", "", "OAuthTokenStore", "", "depend", "utilise"),
    ("AccessControlService", "", "MatterAccess", "", "depend", "gère"),
    ("InvitationService", "", "ClientInvitation", "", "depend", "gère"),
    ("AuditService", "", "AuditEvent", "", "depend", "écrit"),
    ("MatterService", "", "AccessControlService", "", "depend", "vérifie d'abord"),
    ("DocumentService", "", "AccessControlService", "", "depend", "vérifie d'abord"),
    ("DocumentService", "", "DocumentStore", "", "depend", ""),
    ("DocumentService", "", "MalwareScanner", "", "depend", ""),
    ("MessagingService", "", "AccessControlService", "", "depend", "vérifie d'abord"),
    ("BillingService", "", "AccessControlService", "", "depend", "vérifie d'abord"),
    ("BillingService", "", "PaymentProvider", "", "depend", ""),
    ("SyncService", "", "ClioManageGateway", "", "depend", ""),
    ("SyncService", "", "SyncJob", "", "depend", "produit"),
    ("SyncService", "", "WebhookEvent", "", "depend", "trace"),
    ("SyncService", "", "Matter", "", "depend", "alimente (cache)"),
]

LAYER_TITLES = {
    "identity": "Identité et accès", "matter": "Dossiers", "document": "Documents",
    "messaging": "Messagerie", "billing": "Facturation et signature",
    "notification": "Notifications", "admin": "Intégration et audit (schémas private / audit)",
    "service": "Services applicatifs (serveur uniquement)",
    "provider": "Passerelles et fournisseurs (interfaces + implémentations)",
}


def mermaid() -> str:
    arrows = {"assoc": "-->", "compose": "*--", "realize": "..|>", "depend": "..>"}
    lines = ["classDiagram", "  direction LR"]
    current = None
    for name, stereo, layer, attrs, methods in CLASSES:
        if layer != current:
            lines.append(f"  %% ==================== {LAYER_TITLES[layer].upper()} ====================")
            current = layer
        lines.append(f"  class {name} {{")
        if stereo:
            lines.append(f"    <<{stereo}>>")
        for a in attrs:
            lines.append(f"    {a.split(' = ')[0]}")
        for m in methods:
            if not m.startswith("("):
                lines.append(f"    {m}")
        lines.append("  }")
    lines.append("  %% ==================== ÉNUMÉRATIONS ====================")
    for name, values in ENUMS:
        lines.append(f"  class {name} {{")
        lines.append("    <<enumeration>>")
        lines.extend(f"    {v}" for v in values)
        lines.append("  }")
    lines.append("  %% ==================== RELATIONS ====================")
    for src, sc, dst, dc, kind, label in RELATIONS:
        if kind == "compose":   # composition : le losange est du côté du conteneur
            rel = f'  {src} "{sc}" *-- "{dc}" {dst}'
        elif kind == "assoc":
            rel = f'  {src} "{sc}" --> "{dc}" {dst}'
        else:
            rel = f"  {src} {arrows[kind]} {dst}"
        if label:
            rel += f" : {label}"
        lines.append(rel)
    return "\n".join(lines)


def drawio() -> str:
    col_w, gap_x, gap_y, line_h, head_h = 280, 40, 30, 15, 30
    layer_cols = {"identity": 0, "matter": 1, "document": 2, "messaging": 2, "billing": 3,
                  "notification": 3, "admin": 4, "service": 5, "provider": 6}
    fills = {"identity": "#E8ECF5", "matter": "#E8ECF5", "document": "#E8ECF5",
             "messaging": "#E8ECF5", "billing": "#E8ECF5", "notification": "#E8ECF5",
             "admin": "#F4F5F7", "service": "#F5E9C8", "provider": "#FFFFFF"}
    y_cursor = {c: 160 for c in range(8)}
    cells, ids = [], {}

    def box(cid, title, body_lines, col, fill, stroke="#0D1B3E", italic=False):
        x = 40 + col * (col_w + gap_x)
        h = head_h + max(1, len(body_lines)) * line_h + 10
        y = y_cursor[col]
        y_cursor[col] += h + gap_y
        style = (f"swimlane;fontStyle={3 if italic else 1};childLayout=stackLayout;horizontal=1;"
                 f"startSize={head_h};horizontalStack=0;resizeParent=1;collapsible=0;html=1;"
                 f"fillColor=#0D1B3E;fontColor=#FFFFFF;strokeColor={stroke};swimlaneFillColor={fill};"
                 f"fontFamily=Helvetica;fontSize=12;")
        cells.append(f'<mxCell id="{cid}" value="{escape(title)}" style="{style}" vertex="1" parent="1">'
                     f'<mxGeometry x="{x}" y="{y}" width="{col_w}" height="{h}" as="geometry"/></mxCell>')
        body = "&lt;br&gt;".join(escape(b) for b in body_lines) or "&#160;"
        cells.append(f'<mxCell id="{cid}_b" value="{body}" style="text;html=1;align=left;verticalAlign=top;'
                     f'spacingLeft=6;spacingRight=6;overflow=hidden;whiteSpace=wrap;fontFamily=Courier New;fontSize=10;'
                     f'fontColor=#0D1B3E;" vertex="1" parent="{cid}">'
                     f'<mxGeometry y="{head_h}" width="{col_w}" height="{h - head_h}" as="geometry"/></mxCell>')

    for i, (name, stereo, layer, attrs, methods) in enumerate(CLASSES):
        cid = f"c{i}"
        ids[name] = cid
        title = f"«{stereo}» {name}" if stereo else name
        body = attrs + (["──────────"] if attrs and methods else []) + methods
        box(cid, title, body, layer_cols[layer], fills[layer],
            stroke="#B8962E" if stereo == "interface" else "#0D1B3E", italic=stereo == "interface")
    for j, (name, values) in enumerate(ENUMS):
        cid = f"e{j}"
        ids[name] = cid
        box(cid, f"«enumeration» {name}", values, 7, "#FDF8EE", stroke="#B8962E")

    edge_styles = {
        "assoc": "endArrow=open;endFill=0;",
        "compose": "startArrow=diamondThin;startFill=1;startSize=14;endArrow=none;",
        "realize": "endArrow=block;endFill=0;dashed=1;",
        "depend": "endArrow=open;endFill=0;dashed=1;",
    }
    for k, (src, sc, dst, dc, kind, label) in enumerate(RELATIONS):
        text = label
        if sc or dc:
            text = f"{sc} → {dc}" + (f" ({label})" if label else "")
        cells.append(f'<mxCell id="r{k}" value="{escape(text)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;'
                     f'{edge_styles[kind]}strokeColor=#4A4A5A;fontSize=9;fontColor=#4A4A5A;labelBackgroundColor=#FFFFFF;" '
                     f'edge="1" parent="1" source="{ids[src]}" target="{ids[dst]}">'
                     f'<mxGeometry relative="1" as="geometry"/></mxCell>')

    header = ('<mxCell id="title" value="LEX CANADA LAW — PORTAIL CLIENT — DIAGRAMME DE CLASSES v2.1&lt;br&gt;'
              '&lt;font style=&quot;font-size:11px&quot;&gt;Next.js (App Router) + Supabase (Auth, PostgreSQL + RLS, schémas public / private / audit) '
              '+ Clio Manage API (région CA) + Microsoft Graph / SharePoint — fournisseurs derrière interfaces, mocks par défaut&lt;/font&gt;" '
              'style="rounded=0;whiteSpace=wrap;html=1;fillColor=#0D1B3E;fontColor=#FFFFFF;strokeColor=none;fontSize=18;'
              'fontStyle=1;align=left;spacing=12;fontFamily=Georgia;" vertex="1" parent="1">'
              '<mxGeometry x="40" y="20" width="2560" height="80" as="geometry"/></mxCell>')
    legend = ('<mxCell id="legend" value="Légende — fond bleu pâle : entités de domaine (1:1 avec supabase/schema.sql) · gris : schémas private/audit (non exposés) · '
              'doré : services serveur · cadre doré italique : interfaces · ◆ composition · ⇢ dépendance · ▷ pointillé : implémentation · '
              'Tout service vérifie AccessControlService AVANT tout appel Clio/Graph." '
              'style="rounded=0;whiteSpace=wrap;html=1;fillColor=#F4F5F7;fontColor=#0D1B3E;strokeColor=#B8962E;fontSize=11;align=left;spacing=8;" '
              'vertex="1" parent="1"><mxGeometry x="40" y="110" width="2560" height="36" as="geometry"/></mxCell>')
    bottom = max(y_cursor.values()) + 20
    cartouche = (f'<mxCell id="cartouche" value="Titre : Lex Canada Law – Client Portal Class Diagram&lt;br&gt;Version : 2.1&lt;br&gt;'
                 f'Statut : Target Architecture&lt;br&gt;Auteur : Lex Canada Law&lt;br&gt;Destinataire : Technology Partner&lt;br&gt;'
                 f'Date : 2026-10-01&lt;br&gt;Classification : Confidential – Internal Use Only" '
                 f'style="rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;fontColor=#0D1B3E;strokeColor=#0D1B3E;fontSize=11;'
                 f'align=left;verticalAlign=top;spacing=8;" vertex="1" parent="1">'
                 f'<mxGeometry x="2300" y="{bottom}" width="300" height="130" as="geometry"/></mxCell>')
    body = "\n".join([header, legend, *cells, cartouche])
    return ('<mxfile host="app.diagrams.net" agent="lex-canada-portal" version="24.0.0">\n'
            '  <diagram name="Class Diagram v2.0 - Portail Client Lex Canada" id="lex-portal-class-v2">\n'
            f'    <mxGraphModel dx="2600" dy="1600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
            f'fold="1" page="1" pageScale="1" pageWidth="2700" pageHeight="{bottom + 200}" math="0" shadow="0">\n'
            '      <root>\n<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n'
            f'{body}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n')


def main() -> None:
    (ROOT / "diagrams" / "class-diagram-v2.drawio").write_text(drawio(), encoding="utf-8")
    template = (ROOT / "diagrams" / "class-diagram.template.md").read_text(encoding="utf-8")
    (ROOT / "docs" / "class-diagram.md").write_text(template.replace("{{MERMAID}}", mermaid()), encoding="utf-8")
    print(f"{len(CLASSES)} classes, {len(ENUMS)} énumérations, {len(RELATIONS)} relations")


if __name__ == "__main__":
    main()
