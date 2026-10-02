# Feuille de route d'implémentation

> Ce fichier manquait dans les livrables de la Phase 0 (il était cité par README.md et CLAUDE_CODE_PROMPT.md). Il est recréé le 2026-10-01.
> **Règle :** une phase ne commence qu'après la **validation explicite** de la précédente par le responsable du projet. Les phases ne se fusionnent pas.

## Vue d'ensemble

| Phase | Objectif | Dépend de | Sortie |
|---|---|---|---|
| 0 | Cadrage (documents) | — | ✅ Terminée (docs/, schéma v2, diagrammes) |
| 1 | Fondations : auth, base de données, RLS, design system, portail complet **sur données fictives**, espace admin | Rien d'externe | Application déployable en préproduction avec données fictives |
| 2 | Clio Manage en **lecture** : dossiers, contacts, calendrier, factures, webhooks | Compte développeur Clio (région CA) | Données réelles en lecture, synchronisation fiable |
| 3 | Documents : consultation, téléchargement, téléversement avec antivirus | Décision SharePoint ou Clio Documents ; App Registration Graph ; fournisseur antivirus | Flux documentaire complet |
| 4 | Messagerie réelle, paiement, signature électronique (une fonction à la fois, derrière son interface) | Fournisseurs confirmés | Portail complet |
| 5 | Durcissement et mise en production : audit de sécurité externe, AIVP, plan d'incident, monitoring, domaine | Phases 1 à 4 | Lancement |

## Phase 1 — Fondations (détail)

### 1.1 Socle — ✅ J1 (2026-10-01, ADR 0006)
- [x] Next.js (version stable courante, App Router), TypeScript `strict`, pnpm, ESLint, Prettier.
- [x] Tailwind CSS v4 + shadcn/ui ; tokens de `docs/design-system.md` (**faire valider les couleurs avant de les figer**).
- [x] `next-intl` : routes `/[locale]`, `messages/fr.json` et `messages/en.json`, FR par défaut (à confirmer).
- [x] Polices via `next/font/google` (Playfair Display, DM Sans, Cormorant Garamond).
- [x] Structure de dossiers d'`AGENTS.md` §3, `.env.example` (sans valeurs).
- [x] En-têtes de sécurité : CSP avec nonce (sans `unsafe-inline` pour les scripts), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

### 1.2 Base de données — ✅ J2 (2026-10-01, ADR 0007)
- [x] `supabase init` ; migration initiale (= schéma v2.1) + durcissement des privilèges par défaut ; `pnpm db:reset` sans erreur (PostgreSQL 17).
- [x] 60 tests pgTAP bloquants (`pnpm db:test`) : les 32 scénarios + `security.md` §2 réalisables en base. Contre-épreuve faite (politique affaiblie → 7 échecs).
- [x] `pnpm db:types` → `types/database.ts` ; `types/domain.ts`.
- [x] `supabase/seed.sql` d'après `docs/mock-data.md` ; `pnpm db:seed-passwords`.

### 1.3 Authentification — ✅ J3 (2026-10-01, ADR 0010 ; en revue)
- [x] Client : connexion, MFA TOTP obligatoire (enrôlement à la 1re connexion), mot de passe oublié et réinitialisation, déconnexion, « déconnecter tous les appareils ».
- [x] Invitation : création par un firm_admin, e-mail avec jeton à usage unique (72 h, haché en base), activation, création du mot de passe, enrôlement MFA, puis `matter_access` créé depuis `client_invitation_matters`.
- [x] Personnel : « Se connecter avec Microsoft » (voir `auth-entra-id-integration.md`).
- [x] Middleware : session, redirection MFA, garde par rôle ; le serveur revérifie ensuite (`requireRole`).
- [x] Limitation de débit : connexion, réinitialisation, invitation (`private.rate_limit_buckets`).

### 1.4 Portail client (données fictives)
- [ ] `MockDocumentStore` qui reproduit les **sous-dossiers SharePoint** (shared / client_upload / signed / internal), pour que l'interface Documents soit définitive dès la Phase 1.
- [ ] Gabarit (barre latérale, en-tête, tiroir mobile), puis toutes les pages de `page-map.md` §2 marquées Phase 1.
- [ ] États chargement / vide / erreur ; indicateur de fraîcheur ; badge « Données de démonstration ».

### 1.5 Espace cabinet
- [ ] Clients, invitations, dossiers (équipe, accès, **révocation**), audit (`list_audit_events`), tous journalisés.

### 1.6 Qualité
- [ ] Vitest (services, validation), Playwright (parcours : invitation, connexion + MFA, consultation d'un dossier, révocation pendant une session ouverte, tentative d'accès à un dossier d'autrui).
- [x] CI : lint, typecheck, tests unitaires, `supabase test db`, build, recherche de secrets — **avancée au 2026-10-01** (ADR 0008). Reste : ajouter les e2e en J6.
- [ ] Accessibilité : axe sans violation critique ; navigation au clavier ; contrastes (voir la remarque sur l'or dans design-system.md).

**Livrable :** démonstration en préproduction + rapport de fin de phase (format d'`AGENTS.md` §9).

## Phase 2 — Clio Manage (lecture)
- OAuth 2.0 Authorization Code + PKCE, région CA (`ca.app.clio.com`), jetons dans le coffre-fort (`OAuthTokenStore`).
- `ClioManageClient` : matters, contacts, calendar_entries, bills, activities. Respect de **50 req/min**, `Retry-After` sur 429, pagination de 200 par page, backoff exponentiel. Toutes les réponses validées par Zod.
- `SyncService` : jobs dans `private.sync_jobs` (verrou, reprise, état `dead` après `max_attempts`), déclenchés par une tâche planifiée (Vercel Cron ou Azure Functions, selon l'hébergeur).
- Webhooks Clio : vérification de signature **avant** tout traitement, idempotence (`private.webhook_events`), puis synchronisation ciblée.
- Remplacement de `MockClioManageGateway` par `ClioManageClient` derrière une variable d'environnement. Le mock reste pour les tests.

## Phase 3 — Documents (SharePoint, ADR 0004)
Détail complet : `docs/sharepoint-integration.md`.
- Prérequis cabinet : App Registration « Documents (Graph) » + `Sites.Selected` + rôle `write` sur le site + certificat ; choix de l'antivirus (option A ou B) ; organisation des dossiers.
- `GraphClient` (certificat, retry 429/503, Zod), puis `SharePointDocumentStore` : `ensureMatterFolder`, `upload` (session d'envoi pour les gros fichiers), `openContent` (flux, conversion PDF pour l'aperçu), `delta`, `subscribe` / `renew`.
- Création automatique du dossier SharePoint au premier octroi d'accès (`private.matter_storage_folders`).
- Synchronisation : requête delta déclenchée par les notifications Graph + passage de secours toutes les 15 min ; renouvellement planifié des abonnements.
- Dépôt client : contrôles (type réel, taille, débit) → antivirus → `02 Déposé par le client`. Téléchargement et aperçu **en flux** par le serveur, jamais d'URL SharePoint côté client. Audit de chaque opération.
- Tests : document `Interne` jamais visible ; fichier déplacé hors de `01 Partagé` qui disparaît ; notification falsifiée (`clientState` invalide) rejetée ; abonnement expiré renouvelé.

## Phase 4 — Fonctions reportées
Une fonction à la fois, chacune avec son ADR et ses tests :
- **Messagerie** : notifications e-mail (sans contenu sensible dans l'e-mail : « Vous avez un nouveau message », avec un lien).
- **Paiement** : `PaymentProvider` (Clio Payments ou Stripe). Le portail ne voit jamais de numéro de carte (page hébergée chez le fournisseur). Webhook signé et idempotent.
- **Signature** : `SignatureProvider` (DocuSign) avec webhook Connect signé.

## Phase 5 — Mise en production
Audit de sécurité indépendant · AIVP validée · plan de réponse aux incidents · sauvegardes testées (restauration) · monitoring et alertes · domaine `portal.lexcanadalaw.com` (à confirmer) · secrets renouvelés · plan Supabase Pro ou supérieur.
