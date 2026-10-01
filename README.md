# Lex Canada Law — Portail Client

Portail client sécurisé et bilingue (FR/EN) du cabinet **Lex Canada Law**, avec un espace d'administration pour le cabinet.
Pile prévue : Next.js (App Router) + Supabase (PostgreSQL + RLS, Auth + MFA, région Canada) + Clio Manage (région CA) + Microsoft Entra ID / SharePoint.

> **État au 2026-10-01** : Phase 1. **J1 (socle)** et **J2 (base de données)** terminés sur `feat/j1-socle` puis `feat/j2-base-de-donnees` : Supabase local, 2 migrations, 60 tests pgTAP, types, données fictives. Prochain jalon : J3 (authentification).

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `AGENTS.md` | **Règles du projet** pour tout agent ou développeur (fait autorité) |
| `CLAUDE.md` | Instructions propres à Claude Code (importe AGENTS.md) |
| `CLAUDE_CODE_PROMPT.md` | Prompt de démarrage à coller dans Claude Code, et prompts des phases suivantes |
| `.claude/settings.json` | Interdit à Claude Code de lire les fichiers `.env*` et de pousser vers Supabase distant |
| `supabase/migrations/` | **Migrations — font foi** (ADR 0007) |
| `supabase/schema.sql` | Référence figée du **schéma de base de données v2.1**, exécutable (22 tables publiques, schémas `private` et `audit`, RLS complète : 47 politiques) |
| `supabase/tests/database/` | **60 tests pgTAP bloquants** (RLS, rôles, révocation, audit, privilèges) |
| `supabase/smoke/` | Test de fumée hors Supabase (32 scénarios) |
| `docs/database.md` | Architecture de la base : rôles, ERD, dictionnaire, matrice RLS, stockage, rétention |
| `docs/class-diagram.md` | Diagramme de classes v2.1 (Mermaid) : 58 classes, 15 énumérations |
| `diagrams/class-diagram-v2.drawio` | Même diagramme, éditable dans [app.diagrams.net](https://app.diagrams.net) |
| `diagrams/generate_class_diagram.py` | Régénère les deux diagrammes à partir d'une source unique |
| `docs/design-system.md` | Couleurs, typographie, composants, gabarits, et **inventaire de chaque élément de la maquette** (§7) |
| `docs/sharepoint-integration.md` | **Gestion des fichiers clients dans SharePoint** : organisation, permissions, flux de synchronisation, dépôt, téléchargement, antivirus |
| `docs/page-map.md` | Toutes les routes, rôles, sources de données, phases |
| `docs/mock-data.md` | Données fictives de la Phase 1 (reprises de la maquette) |
| `docs/implementation-roadmap.md` | Phases 0 à 5 et liste de tâches de la Phase 1 |
| `docs/auth-entra-id-integration.md` | Authentification client (MFA) et personnel (Microsoft) |
| `docs/security.md`, `docs/privacy-and-data-residency.md` | Exigences de sécurité et de confidentialité |
| `docs/open-questions.md` | **Décisions qui reviennent au cabinet**, à trancher avant les phases concernées |
| `docs/decisions/` | ADR 0001 à 0007 (0004 SharePoint · 0005 DocuSign · 0006 socle J1 · 0007 base de données J2) |
| `docs/reference/` | PDF du cabinet : mémorandum EA, schéma directeur, architecture verrouillée |
| `docs/archive/` | Versions v1 remplacées (schéma, diagramme, modèle de données, cartographie des pages) |

## Démarrage local

```bash
nvm use            # Node 24 (fichier .nvmrc)
pnpm install
cp .env.example .env.local   # facultatif en J1
pnpm dev           # http://localhost:3000 → /en ou /fr
```

### Base de données locale (Docker via OrbStack)

```bash
pnpm db:start            # 1er lancement : téléchargement des images (plusieurs minutes)
pnpm db:reset            # migrations + données fictives
pnpm db:seed-passwords   # mots de passe de test → supabase/seed.local.md (ignoré par Git)
pnpm db:test             # 60 tests pgTAP — doivent tous passer
```

Studio local : http://127.0.0.1:54323 · e-mails locaux (Inbucket) : http://127.0.0.1:54324.
Si `docker` est introuvable, terminez la configuration d'OrbStack (ouvrir l'application), ou exportez `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` (ADR 0007).

Vérifications : `pnpm lint && pnpm typecheck && pnpm test && pnpm db:test && pnpm build`. Guide visuel du design system : http://localhost:3000/en/styleguide (développement uniquement).

## Démarrer avec Claude Code

1. Initialiser le dépôt Git et le pousser sur un dépôt **dont le cabinet est propriétaire** :
   ```bash
   git init && git add . && git commit -m "docs: cadrage et schéma v2"
   ```
2. Ouvrir ce dossier dans Claude Code, puis coller le bloc de `CLAUDE_CODE_PROMPT.md`.
3. Valider chaque jalon (J1 à J6) avant de laisser l'agent continuer.

## Prérequis à réunir (voir `docs/technical-access-requirements.md`)

- Projet Supabase en **ca-central-1**, plan Pro (le plan gratuit se met en pause).
- **Renouveler tous les secrets** connus de l'ancienne équipe (ADR 0002).
- App Registration Entra ID « Lex Canada Portal — Staff Auth » : nouveau secret, et ajout de la redirect URI Supabase.
- Compte développeur Clio, région Canada (Phase 2).
- App Registration « Documents (Graph) » avec `Sites.Selected` sur le site « Dossiers clients » (Phase 3).
