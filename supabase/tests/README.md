# Tests de la base de données

| Emplacement | Rôle | Commande |
|---|---|---|
| `database/*.test.sql` | **Tests pgTAP bloquants** (RLS, rôles, révocation, audit, privilèges) sur Supabase local | `pnpm db:test` |
| `database/_fixture.psql` | Jeu d'essai commun (comptes, dossiers, documents, messages) inclus par `\ir` dans chaque test, créé et annulé dans la transaction du test | — |
| `../smoke/rls-scenarios.sql` | Test de fumée historique (32 scénarios) sur un PostgreSQL nu avec `../smoke/_stub-supabase-auth.sql` | voir l'en-tête du fichier |

Règles (AGENTS.md §6) :
- Toute nouvelle table de `public` arrive avec ses tests dans la **même** branche. Le test `01_structure` échoue si une table n'a ni RLS ni politique.
- Un test ne se désactive jamais pour « faire passer ».
- Identités simulées : `tests.authenticate_as(<uuid>, 'aal1' | 'aal2')`, `tests.as_anon()`, puis `tests.clear_authentication()`.

Correspondance avec `docs/security.md` §2 : voir le tableau ajouté dans ce document.
