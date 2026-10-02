# ADR 0006 — Décisions du socle (jalon J1)

**Statut :** Acceptée (validée par le responsable du projet le 2026-10-01, avec l'approbation du plan J1)
**Date :** 2026-10-01

## Décisions

| # | Sujet | Décision | Raison |
|---|---|---|---|
| 1 | Dépôt | Dépôt Git **indépendant** à `~/Desktop/lex-portal` (le dossier a quitté le dépôt `smartegydev`) | Historique propre, aucune interférence avec les autres sites |
| 2 | Langue par défaut | **Anglais** (`/en`). La détection du navigateur reste active : un navigateur francophone arrive sur `/fr`. `preferred_language` vaut `'en'` par défaut dans `supabase/schema.sql` (`profiles`, `client_invitations`) | Cohérent avec le site public lexcanadalaw.com (100 % anglais) |
| 3 | Or des petits textes | Nouveau token **`gold-ink #8A6D1A`** (contraste 4,9:1) pour les liens et les textes dorés de moins de 18px. `gold #B8962E` reste utilisé pour les icônes, bordures, focus et grands textes | WCAG 2.2 AA (`#B8962E` sur blanc ≈ 2,8:1) |
| 4 | Texte `muted-foreground` | Assombri de `oklch(55%)` à `oklch(45%)` ; `ink-subtle #8A8A9A` (≈ 3,4:1) réservé aux textes ≥ 14px | Accessibilité |
| 5 | Versions | **TypeScript 6.0.3** épinglé (la 7.0 « latest » a un nouveau compilateur dont la compatibilité avec Next.js 16 n'est pas établie) ; **Node 24 LTS** (`.nvmrc`, `engines >= 24`) ; Next.js 16.3.8 ; React 19.2 ; next-intl 4.14 ; Zod 4 ; Tailwind 4 ; shadcn/ui (Radix, préréglage Nova personnalisé) | Stabilité |
| 6 | Middleware | Fichier **`proxy.ts`** (Next.js 16 a renommé `middleware.ts` en `proxy.ts`, voir `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) | Convention de la version installée |
| 7 | CSP | Nonce par requête, généré dans `proxy.ts` (`server/security/csp.ts`) ; `script-src 'self' 'nonce-…' 'strict-dynamic'` sans `unsafe-inline`. **Production** : `style-src 'self' 'nonce-…'`. **Exception 1** : `style-src-attr 'unsafe-inline'` (attributs `style="…"` de Radix et des barres de progression, sans exécution de code). **Exception 2, développement uniquement** : `style-src 'self' 'unsafe-inline'` et `script-src … 'unsafe-eval'`, car Turbopack injecte des `<style>` sans nonce et React utilise `eval` en dev (violations constatées puis corrigées le 2026-10-01). Tests : `tests/unit/csp.test.ts` | Sécurité maximale compatible avec le framework |
| 8 | Rendu | Toutes les pages sont rendues dynamiquement (`await connection()` dans `app/[locale]/layout.tsx`), condition pour que le nonce soit appliqué | Exigence Next.js pour les nonces |
| 9 | Fusion de classes | Paquet `cn` (officiel shadcn-ui, remplace clsx + tailwind-merge), réexporté par `lib/utils.ts` | Généré par shadcn 4 |
| 10 | Garde-fou d'import | Règle ESLint `no-restricted-imports` : `@/server/*` est interdit dans `components/`, `lib/` et `i18n/` ; `react/no-danger` en erreur | AGENTS.md §2.2-2.3 et §7, vérifié par un essai volontaire |

## Conséquences
- `AGENTS.md` mentionne `proxy.ts`, Node 24 et TS 6.
- Le guide de style `/[locale]/styleguide` n'existe qu'en développement (404 en production, vérifié).
- `next start` signale qu'`output: "standalone"` doit être lancé via `node .next/standalone/server.js` en production. À traiter au moment du choix de l'hébergeur.
