# CLAUDE.md

Les règles du projet sont dans AGENTS.md, qui fait autorité pour tous les agents :

@AGENTS.md

## Spécifique à Claude Code

- **Avant une tâche de plus de quelques fichiers** : passer en mode plan, présenter le plan (fichiers, migrations, tests), puis attendre la validation.
- **Recherches larges** dans `docs/` ou dans le code : déléguer à un sous-agent Explore, pour garder le contexte principal propre.
- **Après toute modification de schéma** : `supabase db reset && supabase test db`, puis `supabase gen types typescript --local > types/database.ts`.
- **Vérification visuelle** : lancer `pnpm dev` et contrôler la page dans le navigateur (desktop, puis 375 px de large) avant d'annoncer une tâche d'interface terminée. Comparer avec `docs/design-system.md`.
- **Ne jamais lire** `.env`, `.env.local`, `.env.*.local`, `supabase/seed.local.md` (bloqués dans `.claude/settings.json`). Pour connaître une variable, lire `.env.example`.
- **Ne jamais saisir** de mot de passe, de clé ou de jeton réel. Les comptes de test sont générés par le seed.
- Quand une règle d'AGENTS.md empêche de terminer une tâche, s'arrêter et l'expliquer. Ne jamais contourner la règle.
- Répondre en **français** ; le code et les identifiants restent en anglais.
