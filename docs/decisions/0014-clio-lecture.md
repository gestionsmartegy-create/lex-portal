# ADR 0014 — Clio Manage en lecture (Phase 2, préproduction)

- **Statut** : accepté (2026-10-03)
- **Contexte** : ADR 0013 (préproduction accélérée). Clio est branché en lecture pendant le week-end. Le développement se fait sans les identifiants du cabinet, sur un faux Clio. Le vrai Clio s'active par `INTEGRATION_MODE_CLIO=live`.

## Décision

| # | Sujet | Décision |
|---|---|---|
| 1 | Périmètre | Lecture seule. On n'utilise que les ressources **« Confirmé »** de `docs/clio-api-mapping.md` : contacts, matters et bills (lecture). Le calendrier (statut « partiel »), les documents Clio et les webhooks sont **reportés**. Les rendez-vous restent ceux du portail. |
| 2 | OAuth | Authorization Code avec **PKCE (S256)**, région CA (`ca.app.clio.com`), lancé par un **firm_admin** depuis `/admin/integrations`. `state` et le vérificateur PKCE sont gardés dans un cookie HttpOnly, limité à `/api/integrations/clio` et valable 10 min. `state` est comparé en temps constant. Le rôle est revérifié au retour. Adresse de retour : `<APP_BASE_URL>/api/integrations/clio/callback`. |
| 3 | Jetons | **Supabase Vault**. `private.integration_connections` ne garde que la référence (`vault_secret_id`). Les RPC `integration_save_tokens`, `integration_read_tokens`, `integration_report` et `integration_disconnect` sont exécutables par **service_role seulement**. Le firm_admin voit l'**état** des connexions (`integration_status_list`), jamais les jetons. La déconnexion **supprime** le secret. Le jeton est rafraîchi 60 s avant son échéance. |
| 4 | Client | `ClioManageClient` : débit borné à **45 req/min** (marge sous les 50 documentées) ; `Retry-After` respecté sur 429 ; reprise exponentielle sur 5xx (4 tentatives) ; pagination par `meta.paging.next`, **même hôte seulement** ; réponses **validées par Zod** ; champ `redacted: true` traité comme absent ; codes d'erreur internes, jamais la réponse brute. |
| 5 | Ce qui est synchronisé | Seuls les dossiers d'un contact Clio **importé explicitement** par un firm_admin, par son e-mail exact, ou ceux déjà liés (`clio_matter_id`). Aucune copie massive des données du cabinet. Le contact est relié au compte client du portail qui a le même e-mail (`external_accounts`). |
| 6 | Accès | **La synchronisation ne donne jamais d'accès.** L'octroi reste une action du firm_admin (invitation ou « Dossiers et accès »). |
| 7 | Factures | Seules celles **émises au client** : en attente de paiement (`due`, ou `overdue` si l'échéance est passée et un solde reste), payées, annulées. **Jamais** les brouillons ni celles en approbation. Montants convertis en chaîne à 2 décimales. |
| 8 | Planification | **Vercel Cron**, toutes les 30 min (`vercel.json`), vers `/api/cron/sync`. Le secret `CRON_SECRET` est vérifié en temps constant (404 sinon). Le plan Hobby de Vercel limite les tâches planifiées à une par jour : il faut le plan Pro pour 30 min. Bouton « Synchroniser maintenant » dans l'espace cabinet. |
| 9 | Faux Clio | `MockClioManageGateway` : contacts `@example.com`, dossiers `LC-2026-02xx`, une facture brouillon pour vérifier qu'elle est exclue. Tout ce qui en vient est `is_mock = true`, avec le badge « Données de démonstration ». |

## À vérifier avec le compte développeur du cabinet (avant les vrais clients)
- Les noms exacts des champs demandés (`fields=`) pour matters, contacts et bills, et le filtre `matter_id` sur `bills.json`.
- Les valeurs exactes de `bills.state` du compte canadien.
- Les droits accordés à l'application, et l'effet de « Contacts Visibility » (champs masqués).

## Conséquences
- Avec `INTEGRATION_MODE_CLIO=live`, il faut `CLIO_CLIENT_ID` et `CLIO_CLIENT_SECRET` ; sinon le démarrage échoue, sans aucun retour silencieux au faux Clio.
- Webhooks Clio (signature, idempotence par `private.webhook_events`) : plus tard. La synchronisation planifiée sert de filet.
- Tests :
  - pgTAP `12_integrations` : droits, chiffrement, un secret par connexion, suppression ;
  - unitaires `clio-client.test.ts` : pagination, autre hôte ignoré, 429, 401, champs masqués, rafraîchissement, débit, correspondance des factures, état OAuth ;
  - intégration `clio-sync.test.ts` : Vault réel, import idempotent sans accès, brouillon exclu ;
  - e2e : la page Intégrations et l'import.

## Addendum — revue de sécurité indépendante (2026-10-03, J4, J5 et Phase 2)
Aucune faille critique ni élevée. Tous les constats sont corrigés.

| Constat | Correction |
|---|---|
| **M1** Un client pouvait antidater un message ou créer un fil clos via l'API | Migration `20261003100000_messaging_integrity` : insertion limitée aux colonnes utiles (`messages`, `conversations`, `conversation_participants`). Trigger qui impose les dates pour une session utilisateur. Tests pgTAP `13`. |
| **M2** Aucune limite sur l'envoi de messages ni sur les téléchargements | 30 messages par 10 min et 120 téléchargements par 10 min, par utilisateur (`RATE_LIMITS`). Au-delà, 429 avec `Retry-After`. |
| F1 Échappement de l'.ics incomplet (`;`, retour chariot seul) ; URL abîmée | Échappement RFC 5545 corrigé ; `URL` réservée à `https://`, sans retour à la ligne ni échappement. Test de non-régression. |
| F2 Certaines lectures liées à un dossier ne s'appuyaient que sur la RLS | `assertMatterAccess` appelé dès qu'un `matterId` est fourni (factures, rendez-vous, messages, demandes, signatures) et dans l'export .ics. |
| F3 Redirections construites à partir de l'en-tête `Host` | Retour Clio et fin de session construits sur `APP_BASE_URL`. |
| F4 Une réimportation remettait en cache un dossier purgé | Un dossier `purged_at` n'est jamais réimporté. |
| F5 Rafraîchissement concurrent du jeton Clio | En cas d'échec, le coffre est relu et le jeton neuf enregistré par l'autre processus est utilisé. Test unitaire. |
