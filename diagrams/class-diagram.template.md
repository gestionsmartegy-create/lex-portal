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
{{MERMAID}}
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
