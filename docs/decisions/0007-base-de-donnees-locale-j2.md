# ADR 0007 — Base de données locale, migrations et tests (jalon J2)

**Statut :** Acceptée (plan J2 approuvé le 2026-10-01)
**Date :** 2026-10-01

## Décisions

| # | Sujet | Décision | Raison |
|---|---|---|---|
| 1 | CLI Supabase | **Dépendance de développement du projet** (`supabase@2.119.0`, `pnpm exec supabase` / `pnpm db:*`) au lieu de Homebrew | `brew` refuse l'installation sur ce Mac (Xcode 15.4 trop ancien) ; une version épinglée est en plus identique en local et en CI |
| 2 | Docker | **OrbStack** (Docker 29.4, arm64). Tant que la configuration de premier lancement d'OrbStack n'est pas terminée, exporter `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` et ajouter `/Applications/OrbStack.app/Contents/MacOS/xbin` au `PATH` | Choix du responsable ; plus léger que Docker Desktop |
| 3 | Source de vérité du schéma | Les **migrations** (`supabase/migrations/`) font foi. `supabase/schema.sql` est **figé** comme référence v2.1 (= première migration) et ne doit plus être modifié | Une seule source, historisée (AGENTS.md §6) |
| 4 | Privilèges par défaut | Migration `…_harden_default_privileges.sql` : retrait des droits **par défaut** accordés par Supabase à `anon` et `authenticated` sur les futures tables, séquences et fonctions de `public` ; aucune fonction de `public` n'est exécutable par `anon` | Une table ou une RPC ajoutée plus tard est **fermée par défaut**, même si son auteur oublie la RLS ou les `GRANT` |
| 5 | Configuration Auth locale | `enable_signup = false`, mot de passe ≥ 12 caractères avec minuscules, majuscules, chiffres et symboles, `secure_password_change`, MFA TOTP activé, fournisseur Azure déclaré mais désactivé (valeurs en `env(...)` uniquement), Edge Functions et Analytics désactivés | Reflète la production ; aucun secret dans le dépôt |
| 6 | Tests | **pgTAP** dans `supabase/tests/database/*.test.sql`, avec le jeu d'essai commun `_fixture.psql` inclus par `\ir`. Les 32 scénarios de fumée et ceux de `security.md` §2 réalisables en base y sont repris. Le test de fumée hors Supabase est déplacé dans `supabase/smoke/` | Tests bloquants (`pnpm db:test`) |
| 7 | Données fictives | `supabase/seed.sql` versionné, **sans aucun mot de passe** : comptes `@example.com` (clients) et `demo.*@lexcanadalaw.com` (personnel simulé, `provider = azure`), dossiers `is_mock = true`, dates relatives. `pnpm db:seed-passwords` génère des mots de passe aléatoires (24 caractères) par l'API admin **locale**, refuse tout hôte distant et les écrit seulement dans `supabase/seed.local.md` (ignoré par Git) | AGENTS.md §2.1 et §2.7 |
| 8 | Types | `pnpm db:types` génère `types/database.ts` (schéma `public` seulement, avec en-tête « généré »). `types/domain.ts` en dérive les types métier ; les montants restent en `string` | AGENTS.md §5 |
| 9 | Version de PostgreSQL | **17** (défaut de la CLI 2.119). Le schéma avait été validé sur 16 ; il est revalidé sur 17 par les tests pgTAP | — |

## Conséquences
- Les commandes du projet sont `pnpm db:start`, `db:reset`, `db:test`, `db:types`, `db:seed-passwords`, `db:stop`.
- Toute évolution du modèle = nouvelle migration + tests pgTAP + `pnpm db:types` + mise à jour de `docs/database.md` et du diagramme de classes.
- `supabase link` et `supabase db push` restent interdits à l'agent (`.claude/settings.json`) : la mise en place du projet distant (`ca-central-1`) revient au responsable.
