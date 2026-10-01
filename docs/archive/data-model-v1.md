# Modèle de données Supabase — Phase 0 (conception, pas de migration exécutée)

Ce document décrit le modèle relationnel prévu. Aucune migration n'est créée en Phase 0 (voir `docs/decisions/` pour l'ADR correspondant).

## 1. Tables

```mermaid
erDiagram
  profiles ||--o{ organization_members : appartient
  organizations ||--o{ organization_members : regroupe
  profiles ||--o{ external_accounts : lie
  profiles ||--o{ matter_access : autorise
  matter_access }o--|| matter_cache : reference
  matter_cache ||--o{ document_links : contient
  matter_cache ||--o{ document_requests : contient
  profiles ||--o{ notifications : recoit
  profiles ||--o{ notification_preferences : configure
  profiles ||--o{ audit_events : genere

  profiles {
    uuid id PK
    text email
    text first_name
    text last_name
    text preferred_language
    text phone
    text status
    timestamptz created_at
    timestamptz updated_at
  }
  organizations {
    uuid id PK
    text name
    text type
  }
  organization_members {
    uuid organization_id FK
    uuid user_id FK
    text role
  }
  external_accounts {
    uuid id PK
    uuid user_id FK
    text provider
    text external_contact_id
    text external_region
    jsonb metadata
  }
  matter_access {
    uuid id PK
    uuid user_id FK
    text clio_matter_id
    text access_level
    uuid granted_by FK
    timestamptz granted_at
    timestamptz revoked_at
  }
  matter_cache {
    text clio_matter_id PK
    text display_number
    text title
    text status
    text practice_area
    text responsible_professional
    timestamptz last_synced_at
  }
  document_links {
    uuid id PK
    text matter_id FK
    text sharepoint_drive_id
    text sharepoint_item_id
    text display_name
    text category
    text status
    timestamptz last_synced_at
  }
  document_requests {
    uuid id PK
    text matter_id FK
    uuid client_id FK
    text title
    text description
    date due_date
    text status
  }
  notifications {
    uuid id PK
    uuid user_id FK
    text type
    text title
    text message
    timestamptz read_at
    timestamptz created_at
  }
  notification_preferences {
    uuid user_id PK
    boolean email_enabled
    boolean sms_enabled
    boolean in_app_enabled
  }
  integration_connections {
    uuid id PK
    text provider
    text region
    text status
    text encrypted_credentials_reference
    timestamptz last_sync_at
  }
  sync_jobs {
    uuid id PK
    text provider
    text resource_type
    text resource_id
    text status
    int attempts
    text error_code
    timestamptz started_at
    timestamptz completed_at
  }
  audit_events {
    uuid id PK
    uuid actor_id FK
    text action
    text resource_type
    text resource_id
    inet ip_address
    text user_agent
    jsonb metadata
    timestamptz created_at
  }
```

## 2. Notes de conception

- `matter_cache.clio_matter_id` et `document_links.matter_id` référencent l'identifiant Clio, pas un identifiant Supabase natif — le dossier n'existe « en propre » que dans Clio.
- `external_accounts` permet de supporter plusieurs fournisseurs externes futurs (Clio, potentiellement Entra ID pour le personnel) sans dupliquer `profiles`.
- `integration_connections.encrypted_credentials_reference` est une **référence** vers un coffre-fort de secrets externe — jamais le secret lui-même en base.
- Aucune donnée bancaire, aucun contenu de document, aucun jeton OAuth en clair dans ce modèle.

## 3. Ce qui n'est délibérément pas stocké dans Supabase

- Le contenu des documents (référence uniquement).
- Les montants détaillés de facturation au-delà de ce qui est nécessaire à l'affichage (le solde peut être caché à l'affichage seul, sans devenir une table de vérité comptable).
- Les jetons OAuth en clair.
- Les informations bancaires du client.

## Sources et niveau de confirmation

- Structure des tables : reprise et affinée à partir du cahier des charges fourni.
- Aucune contrainte technique Supabase spécifique (types, limites de colonnes) n'a été vérifiée dans cette phase au-delà de la disponibilité générale de PostgreSQL et RLS — **hypothèse d'architecture**, à valider techniquement en Phase 1 lors de l'écriture réelle des migrations.
