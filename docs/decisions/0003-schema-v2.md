# ADR 0003 — Schéma de base de données v2

**Statut :** Acceptée (à relire par le responsable technique avant la migration initiale)
**Date :** 2026-10-01

## Contexte
Le schéma v1 (`docs/archive/schema-v1.sql`) activait RLS sans écrire les politiques. Il présentait aussi des incohérences avec les exigences de `security.md` et `user-flows.md`.

## Décisions (écarts v1 → v2)

| # | v1 | v2 | Raison |
|---|---|---|---|
| 1 | Rôle dans `organization_members.role` (client / staff / firm_admin) | `profiles.role` (`app_role`) ; `organization_members.role` = owner / member | Le rôle portail est propre à la personne, pas à une organisation ; RLS plus simple et plus sûre |
| 2 | `matter_cache` (PK = id Clio), `on delete cascade` partout | `matters` (PK uuid interne, `clio_matter_id` unique), **jamais supprimé** (purge = anonymisation + `purged_at`), FK `restrict` | La purge du cache effaçait l'historique d'accès ; l'uuid interne permet aussi les dossiers fictifs |
| 3 | Pas d'équipe de dossier | `matter_team` | Moindre privilège : le personnel ne voit que ses dossiers |
| 4 | `matter_access` unique (user, matter), modifiable | Une seule ligne **active** à la fois (index partiel), immuable sauf révocation définitive, `revoked_by`, `revoke_reason` | Historique complet et traçable ; on ne peut pas « dé-révoquer » en douce |
| 5 | Pas d'invitations | `client_invitations` (jeton haché, 72 h) + `client_invitation_matters` | Exigé par `user-flows.md` §1 |
| 6 | Tables d'intégration et d'audit dans `public` | Schémas **`private`** et **`audit`**, non exposés à l'API | Une erreur de politique ne peut pas les exposer |
| 7 | `audit_events` modifiable | `audit.events` append-only (trigger qui bloque UPDATE, DELETE et TRUNCATE) + triggers d'audit automatiques | Traçabilité juridique |
| 8 | Aucune exigence MFA en base | `private.has_mfa()` (`aal2`) dans l'accès client | Le MFA ne repose pas uniquement sur l'interface |
| 9 | `document_links` sans notion de partage | `documents.folder` (remplace `shared_with_client`, ADR 0004), `scan_status`, `sha256`, `deleted_at`, `storage_path` | Un document interne n'est jamais visible ; antivirus avant mise à disposition |
| 10 | `message_read_receipts` par message | `conversation_participants.last_read_at` | Plus simple, suffit pour le compteur « non lus » |
| 11 | Webhooks non tracés | `private.webhook_events` (idempotence + preuve de signature) | `security.md` scénario 4 |
| 12 | Pas de limitation de débit | `private.rate_limit_buckets` | `security.md` §1 |
| 13 | Fuseau par défaut `America/Toronto` | `America/Halifax` | Le cabinet est en Nouvelle-Écosse |
| 14 | `payments` sans idempotence | `idempotency_key` unique, `payer_id`, `failure_code` | Évite les doubles paiements |
| 15 | Notifications sans priorité | `priority` (urgent / info / success, comme la maquette), `matter_id`, `action_url` (chemin interne uniquement) | Correspond au design ; pas de redirection ouverte |
| 16 | Privilèges par défaut de Supabase | `REVOKE` global puis `GRANT` explicite, par colonne pour `profiles` | Défense en profondeur |

## Vérification
31 scénarios exécutés le 2026-10-01 sur PostgreSQL 16 avec un stub du schéma `auth` (`supabase/tests/`). Tous conformes. À rejouer sur Supabase local (`supabase db reset`), puis à convertir en pgTAP.

## Points ouverts
- La langue par défaut reste `fr` (spécification), alors que le site public est en anglais. Voir `open-questions.md`.
- Le seuil de purge des dossiers clos et la durée de conservation de l'audit sont à fixer par le cabinet.
