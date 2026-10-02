# Lex Canada Law — Portail Client

Portail client sécurisé et bilingue (FR/EN) du cabinet **Lex Canada Law**, avec un espace d'administration pour le cabinet.
Pile prévue : Next.js (App Router) + Supabase (PostgreSQL + RLS, Auth + MFA, région Canada) + Clio Manage (région CA) + Microsoft Entra ID / SharePoint.

> **État au 2026-10-01** : Phase 1, jalon **J1 (socle) terminé** sur la branche `feat/j1-socle` : Next.js 16, design system, FR/EN, CSP. Prochain jalon : J2 (base de données, **Docker requis**).

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `AGENTS.md` | **Règles du projet** pour tout agent ou développeur (fait autorité) |
| `CLAUDE.md` | Instructions propres à Claude Code (importe AGENTS.md) |
| `CLAUDE_CODE_PROMPT.md` | Prompt de démarrage à coller dans Claude Code, et prompts des phases suivantes |
| `.claude/settings.json` | Interdit à Claude Code de lire les fichiers `.env*` et de pousser vers Supabase distant |
| `supabase/schema.sql` | **Schéma de base de données v2**, exécutable (22 tables publiques, schémas `private` et `audit`, RLS complète : 47 politiques) |
| `supabase/tests/rls-scenarios.sql` | 32 scénarios de sécurité validés sur PostgreSQL 16 (à convertir en pgTAP) |
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
| `docs/decisions/` | ADR 0001 à 0005 (0004 : SharePoint, dépôt officiel · 0005 : DocuSign) |
| `docs/reference/` | PDF du cabinet : mémorandum EA, schéma directeur, architecture verrouillée |
| `docs/archive/` | Versions v1 remplacées (schéma, diagramme, modèle de données, cartographie des pages) |

## Démarrage local

```bash
nvm use            # Node 24 (fichier .nvmrc)
pnpm install
cp .env.example .env.local   # facultatif en J1
pnpm dev           # http://localhost:3000 → /en ou /fr
```

Vérifications : `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Guide visuel du design system : http://localhost:3000/en/styleguide (développement uniquement).

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
