# AGENTS.md — Portail Client Lex Canada Law

> Instructions pour tout agent de développement (Claude Code, Codex, Cursor…) et pour tout humain qui contribue.
> Ces règles **priment sur la vitesse**. Pour s'en écarter, il faut un ADR dans `docs/decisions/` validé par le responsable du projet. On ne s'en écarte jamais en silence.

## 0. À lire avant toute tâche

| Ordre | Document | Pourquoi |
|---|---|---|
| 1 | `AGENTS.md` (ce fichier) | Règles, structure, conventions |
| 2 | `docs/implementation-roadmap.md` | Phase en cours, et ce qui est permis ou interdit dans cette phase |
| 3 | `docs/product-requirements.md`, `docs/mvp-scope.md` | Ce qu'on construit, et ce qu'on ne construit pas |
| 4 | `docs/architecture.md`, `docs/source-of-truth.md` | Qui est la source de vérité de quelle donnée |
| 5 | `docs/database.md` + `supabase/schema.sql` | Modèle de données, RLS, rôles |
| 6 | `docs/class-diagram.md` | Services, interfaces, mocks |
| 7 | `docs/security.md`, `docs/auth-entra-id-integration.md` | Exigences de sécurité et tests obligatoires |
| 8 | `docs/design-system.md`, `docs/page-map.md` | Interface |
| 9 | `docs/clio-api-mapping.md`, `docs/sharepoint-integration.md` | Intégrations ; **sharepoint-integration.md aussi pour toute tâche « Documents »** |
| 10 | `docs/open-questions.md` | Ce qui n'est **pas** décidé : ne jamais trancher à la place du cabinet |

Pour une tâche ciblée, lire au minimum 1, 2, puis les documents du domaine touché.

## 1. Le projet en bref

Portail **client** sécurisé et bilingue (FR/EN) du cabinet d'avocats **Lex Canada Law** (Nouvelle-Écosse). Le client y consulte ses dossiers, documents, rendez-vous et factures, et échange avec le cabinet. Il y a aussi un **espace cabinet** (`/admin`) pour gérer les accès et l'audit.
Le portail **présente et orchestre**. Il n'est **jamais** la source de vérité : Clio Manage (région CA) détient les dossiers, la facturation et le calendrier ; SharePoint (à confirmer) détient les documents. Supabase ne détient que les identités, les droits, un cache marqué `last_synced_at`, les données propres au portail et l'audit.

## 2. Règles absolues

1. **Aucun secret dans le dépôt** : pas dans le code, les tests, les fixtures, la documentation ou les commits. Seulement `.env.example` sans valeurs. Ne jamais lire, afficher ni recopier le contenu de `.env*` (sauf `.env.example`) ni de `supabase/seed.local.md`.
2. **`SUPABASE_SERVICE_ROLE_KEY` et tout jeton externe restent côté serveur.** Jamais dans une variable `NEXT_PUBLIC_*`, jamais dans un composant client, jamais dans un log.
3. **Aucun appel à Clio, Microsoft Graph, DocuSign ou à un fournisseur de paiement depuis le navigateur.** Uniquement depuis `server/` (Route Handlers, Server Actions, jobs).
4. **Vérification d'accès d'abord** : tout code qui touche un dossier appelle `AccessControlService.assertMatterAccess()` **avant** toute lecture ou tout appel externe. La RLS revérifie, mais ne remplace pas ce contrôle.
5. **RLS sur toutes les tables de `public`, écrite et testée dans la même migration que la table.** Ne jamais écrire « on activera la RLS plus tard ».
6. **Aucune capacité d'API inventée.** N'implémenter que ce qui est marqué « Confirmé » dans `docs/clio-api-mapping.md` et `docs/sharepoint-integration.md`. Tout le reste passe par une interface + une implémentation `Mock*` clairement nommée.
7. **Ne jamais présenter des données fictives comme réelles** : `is_mock = true`, domaine `example.com`, badge « Données de démonstration ».
8. **Journaliser toute action sensible** dans `audit.events` (accès, téléchargement, droits, invitations, révocations, connexions d'intégration), sans exception.
9. **Ne pas distinguer « n'existe pas » de « pas autorisé »** : même réponse 404, même message.
10. **Aucune décision de `docs/open-questions.md` n'est tranchée par l'agent.** S'arrêter et demander.
11. **Une phase à la fois** (`docs/implementation-roadmap.md`). Ne pas commencer la phase suivante sans validation explicite.
12. **Ne pas désactiver un test, une règle de lint, une vérification de type ou un en-tête de sécurité pour « faire passer ».** Corriger la cause, ou s'arrêter et signaler.

## 3. Structure du projet

```
lex-portal/
├─ AGENTS.md · CLAUDE.md · README.md · CLAUDE_CODE_PROMPT.md
├─ app/
│  ├─ [locale]/
│  │  ├─ (auth)/                 login/ · login/mfa/ · forgot-password/ · reset-password/ · invite/[token]/ · staff/login/
│  │  ├─ portal/                 layout.tsx (barre latérale + garde client/MFA)
│  │  │  ├─ page.tsx             tableau de bord
│  │  │  ├─ matters/ · matters/[matterId]/
│  │  │  ├─ documents/ · messages/ · messages/[conversationId]/
│  │  │  ├─ billing/ · appointments/ · notifications/ · profile/
│  │  └─ admin/                  layout.tsx (garde staff/firm_admin)
│  │     ├─ page.tsx · clients/ · invitations/ · matters/ · matters/[matterId]/access/
│  │     └─ audit/ · sync/ · integrations/
│  ├─ api/
│  │  ├─ auth/callback/          retour OAuth Supabase (Entra ID)
│  │  ├─ integrations/clio/callback/
│  │  ├─ webhooks/clio/ · webhooks/payments/ · webhooks/signature/
│  │  └─ cron/sync/              déclenché par le planificateur (secret d'en-tête obligatoire)
│  ├─ layout.tsx · globals.css · not-found.tsx · error.tsx
├─ components/
│  ├─ ui/                        shadcn/ui (personnalisés selon le design system)
│  ├─ portal/ · admin/ · auth/ · shared/
├─ server/                       ⚠️ chaque fichier commence par `import "server-only"`
│  ├─ auth/                      getUser, requireUser, requireRole, requireMfa
│  ├─ db/                        createServerClient (cookies, RLS), createServiceClient (service_role, usage restreint)
│  ├─ services/                  access-control · audit · invitation · matter · document · messaging · billing · sync · notification
│  ├─ providers/
│  │  ├─ index.ts                choix des implémentations (mock ou réelle) selon l'environnement
│  │  ├─ clio/ · sharepoint/ · payments/ · signature/ · notifications/ · malware/ · tokens/
│  │  │  └─ <fournisseur>/       gateway.ts (interface) · client.ts (réel) · mock.ts · schemas.ts (Zod)
│  ├─ security/                  rate-limit · csp · webhook-signature · tokens (hachage des invitations)
│  └─ validation/                schémas Zod des formulaires et Server Actions
├─ lib/                          code pur partagé (formatage de dates et montants, constantes, routes)
├─ i18n/ · messages/fr.json · messages/en.json
├─ types/                        database.ts (GÉNÉRÉ, ne pas éditer) · domain.ts
├─ supabase/
│  ├─ config.toml · migrations/ (FONT FOI) · seed.sql · schema.sql (référence v2.1 figée)
│  ├─ tests/database/            tests pgTAP (*.test.sql) + _fixture.psql
│  └─ smoke/                     test de fumée hors Supabase
├─ tests/
│  ├─ unit/                      Vitest
│  └─ e2e/                       Playwright
├─ docs/ · diagrams/
├─ proxy.ts                      nonce CSP, locale, puis session et redirections login/MFA (Next.js 16 : ex-middleware.ts)
└─ .env.example
```

Règles de placement :
- Composant qui a besoin d'interactivité : `"use client"` **en feuille de l'arbre**, sans import depuis `server/`.
- Accès aux données : Server Components ou Server Actions → `server/services/*` → `server/providers/*` ou Supabase.
- Une Server Action **valide toujours son entrée avec Zod** et **revérifie l'utilisateur et le rôle**. Ne jamais faire confiance à un identifiant reçu du client.

## 4. Stack et commandes

| Domaine | Choix |
|---|---|
| Framework | **Next.js 16** (App Router, React Server Components), **TypeScript 6.0** `strict` + `noUncheckedIndexedAccess` (pas la 7.0, ADR 0006), **Node 24 LTS** |
| UI | Tailwind CSS v4, shadcn/ui, lucide-react, react-hook-form + Zod |
| i18n | next-intl 4, routes `/[locale]` (`en` par défaut, `fr`), détection du navigateur |
| Données / Auth | Supabase (PostgreSQL + RLS, Auth + MFA TOTP, Storage), `@supabase/ssr`, région **ca-central-1** |
| Tests | Vitest, Playwright, pgTAP (`supabase test db`), axe (accessibilité) |
| Paquets | pnpm |
| Hébergement | **Non tranché** (Vercel ou Azure App Service). Le code reste neutre : pas d'API propre à un hébergeur hors adaptateurs isolés. Prévoir `output: "standalone"`. |

```bash
pnpm install
pnpm dev                     # http://localhost:3000
pnpm lint && pnpm typecheck               # next typegen + tsc
pnpm test                    # Vitest
pnpm test:e2e                # Playwright + axe, build de production contre Supabase local (ADR 0011)
pnpm db:start                # Supabase local (Docker via OrbStack ; CLI épinglée dans le projet, ADR 0007)
pnpm db:reset                # migrations + seed (données fictives, sans mot de passe)
pnpm db:seed-passwords       # mots de passe locaux → supabase/seed.local.md (jamais affichés)
pnpm db:test                 # tests pgTAP (RLS) — BLOQUANTS
pnpm test:integration        # vraies sessions Auth contre Supabase local (ADR 0010)
pnpm env:local               # écrit .env.local depuis Supabase local (valeurs jamais affichées)
pnpm db:types                # régénère types/database.ts
python3 diagrams/generate_class_diagram.py   # régénère le diagramme de classes
```

## 5. Conventions de code

- **Nommage** : fichiers en `kebab-case.ts`, composants en `PascalCase`, fonctions et variables en `camelCase`, SQL en `snake_case`. Le code et les noms techniques sont en **anglais** ; les commentaires et la documentation en **français**.
- **Types** : pas de `any`. Les types de base de données viennent de `types/database.ts` (généré) ; les types métier sont dans `types/domain.ts`, alignés sur `docs/class-diagram.md`.
- **Montants** : `numeric` en base, `string` décimale ou centimes entiers (`bigint`) en TypeScript, **jamais de `number` flottant**. Formatage par `Intl.NumberFormat(locale, { style: "currency", currency: "CAD" })`.
- **Dates** : `timestamptz` en base ; affichage dans le fuseau `America/Halifax` par défaut, sinon celui du rendez-vous.
- **Textes** : aucun texte visible en dur. Tout passe par `messages/{fr,en}.json`, avec des clés hiérarchiques (`portal.dashboard.cards.activeMatters`). Toute clé ajoutée l'est **dans les deux langues**.
- **Erreurs** : jamais de message technique côté client (pile d'appels, SQL, réponse brute d'une API). Utiliser des codes d'erreur internes (`ACCESS_DENIED`, `SYNC_STALE`, …) traduits dans l'interface, et un log serveur structuré **sans données personnelles ni jetons**.
- **Logs** : pas d'e-mail, de nom, de contenu de message, de nom de document ni de jeton. Utiliser les identifiants (uuid) seulement.
- **Validation** : Zod pour les formulaires, les paramètres d'URL, les Server Actions, les réponses d'API externes et les payloads de webhook.
- **Accessibilité** : HTML sémantique, `label` sur chaque champ, focus visible (anneau doré), navigation au clavier, contrastes AA.

## 6. Base de données

- **Toute modification passe par une migration** `supabase/migrations/<horodatage>_<nom>.sql`. On ne modifie jamais une migration déjà appliquée : on en crée une nouvelle.
- Dans la **même** migration qu'une nouvelle table de `public` : `enable row level security`, ses politiques, ses `GRANT` explicites et ses tests pgTAP.
- Les tables qui ne sont pas destinées à l'API vont dans **`private`** ; l'audit va dans **`audit`**.
- Les fonctions `security definer` ont toujours `set search_path = ''` et des noms entièrement qualifiés.
- `service_role` n'est utilisé que dans `server/db/createServiceClient`. Usages permis : synchronisation, webhooks, acceptation d'invitation, écriture d'audit, notifications, et **lecture de l'emplacement externe d'un document** (SharePoint) pour le téléchargement, via **un helper serveur unique** qui (1) vérifie la visibilité du document avec la session de l'utilisateur, (2) lit avec service_role les seules colonnes d'emplacement, (3) journalise `document.downloaded`. Chaque usage est commenté avec sa justification.
- Les lectures de l'interface utilisent le client **avec la session de l'utilisateur** (RLS appliquée), jamais `service_role`.
- **Toujours sélectionner des colonnes explicites**, jamais `select("*")` : sur `matters`, `documents`, `invoices` et `matter_access`, certaines colonnes internes ne sont pas lisibles par l'API utilisateur (ADR 0009) et une sélection `*` échoue.
- Droits **conditionnés à la session** (ADR 0009) : client = compte actif + MFA (`aal2`) ; personnel = **connexion Microsoft uniquement** (`amr` oauth + identité azure). Un mot de passe, un lien magique ou une récupération ne donnent jamais de droits au personnel, même avec MFA. Ne jamais contourner ce contrôle côté application, et n'activer aucun autre fournisseur OAuth.
- Après chaque migration : `supabase db reset`, puis `supabase test db`, puis régénération de `types/database.ts`, puis mise à jour de `docs/database.md` et du diagramme de classes si le modèle a changé.

## 7. Sécurité — vérifications avant de considérer une tâche terminée

- [ ] Aucun secret ajouté ; `.env.example` à jour (noms seulement).
- [ ] Aucun import de `server/` dans un composant client ; `server-only` présent.
- [ ] Entrées validées par Zod ; utilisateur et rôle revérifiés côté serveur.
- [ ] `assertMatterAccess()` appelé avant tout accès à un dossier.
- [ ] Action sensible journalisée dans `audit.events`.
- [ ] RLS et tests pgTAP à jour pour toute table touchée.
- [ ] Aucun `dangerouslySetInnerHTML` sur un contenu externe ou utilisateur.
- [ ] Les URLs de redirection sont internes (`/…`) ou dans une liste blanche : pas de redirection ouverte.
- [ ] Webhooks : signature vérifiée **avant** tout traitement, idempotence via `private.webhook_events`.
- [ ] Téléchargements : URL signée de courte durée, jamais de lien permanent.
- [ ] Les scénarios de `docs/security.md` §2 concernés sont couverts par un test automatisé.

## 8. Intégrations

- Chaque intégration = **interface** (`gateway.ts`) + **mock** (`mock.ts`) + **implémentation réelle** (`client.ts`) + **schémas Zod** (`schemas.ts`).
- Le choix se fait dans `server/providers/index.ts` via `INTEGRATION_MODE_<FOURNISSEUR>=mock|live`, qui vaut `mock` par défaut.
- On n'écrit pas l'implémentation `live` sans identifiants réels fournis par le responsable du projet **et** sans phase qui le prévoit.
- Clio : région CA (`https://ca.app.clio.com`), 50 req/min par jeton, `Retry-After` sur 429, 200 résultats par page, champs `redacted: true` traités comme absents.
- **SharePoint** (ADR 0004) : dépôt officiel des fichiers. Visibilité client = sous-dossier (`documents.folder`), jamais une case à cocher. Accès app-only `Sites.Selected` au seul site « Dossiers clients ». **Jamais d'URL SharePoint ni de `downloadUrl` Graph envoyée au navigateur** : le contenu passe en flux par le serveur. Notifications Graph : `clientState` vérifié, abonnements renouvelés. Détails : `docs/sharepoint-integration.md`.
- Jetons OAuth : `OAuthTokenStore` (Supabase Vault ou Azure Key Vault, à trancher), jamais en clair en base ni dans les logs.

## 9. Définition de « terminé » et rapport

Une tâche est terminée quand `pnpm lint`, `pnpm typecheck`, `pnpm test`, `supabase test db` et `pnpm build` passent, que les e2e concernés passent, et que la documentation touchée est à jour.

**À la fin de chaque tour de travail, rapporter dans ce format :**
1. Ce qui a été réalisé (liste concrète).
2. Fichiers créés ou modifiés.
3. Tests exécutés et résultats (avec les commandes). Si un test échoue, le dire clairement.
4. Limites restantes et risques identifiés.
5. Décisions qui nécessitent une validation avant de continuer.

## 10. Git et décisions

- Branches : `feat/…`, `fix/…`, `chore/…`, `docs/…`. Pas de commit direct sur `main`.
- **Ne jamais fusionner une demande de fusion dont un contrôle de CI (`app`, `database`, `secrets` = secrets et analyse de code) est rouge ou en cours.** `main` n'est pas protégée techniquement (compte GitHub gratuit, ADR 0008) : cette règle la remplace.
- Commits [Conventional Commits](https://www.conventionalcommits.org/fr/) : `feat(portal): carte des dossiers récents`.
- Une décision technique significative = un **ADR** `docs/decisions/NNNN-titre.md` (Contexte · Décision · Conséquences).
- Ne jamais committer `.env*` (sauf `.env.example`), `supabase/seed.local.md`, `.tmp/`, des captures contenant des données réelles.

## 11. S'arrêter et demander quand…

- un document de `docs/` contredit un autre, ou contredit la demande ;
- une tâche exige de trancher une question de `docs/open-questions.md` ;
- une intégration réelle est demandée sans identifiants ou hors de la phase prévue ;
- un test de sécurité échoue et la correction changerait une règle d'accès ;
- un fichier cité ici est absent du dépôt.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
