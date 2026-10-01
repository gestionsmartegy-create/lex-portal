# ADR 0008 — Intégration continue sur un dépôt GitHub gratuit

**Statut :** Acceptée (option C choisie par le responsable le 2026-10-01 ; plan CI approuvé le même jour)
**Date :** 2026-10-01

## Contexte
Le dépôt `SmartegyCanada/lex-portal` est **privé** et appartient à un **compte personnel gratuit**. Sur ce plan, GitHub ne propose ni rôle Admin pour les collaborateurs, ni protection de branche ou ruleset pour les dépôts privés. La revue de méthode du 2026-10-01 avait signalé que des tests qui ne tournent qu'en local ne sont pas réellement bloquants.

## Décision
1. **Option C** : rester en plan gratuit. `main` n'est pas protégée techniquement.
2. **CI GitHub Actions** (`.github/workflows/ci.yml`), lancée sur chaque demande de fusion et chaque push sur `main` :
   - **app** : `lint`, `format:check`, `typecheck`, `test`, `build` (Node 24, pnpm verrouillé) ;
   - **database** : Supabase local réduit au strict nécessaire, puis les **60 tests pgTAP**, puis un **contrôle de dérive** de `types/database.ts` ;
   - **secrets** : gitleaks 8.30.1 (binaire officiel, somme de contrôle vérifiée) sur **tout l'historique**.
3. **Règle de fusion obligatoire** (AGENTS.md §10) : on ne fusionne **jamais** une demande dont un contrôle est rouge ou en cours. Cette discipline remplace la protection de branche indisponible.
4. **Dependabot** hebdomadaire (npm et actions), avec les majeures de TypeScript et Next.js ignorées (versions épinglées, ADR 0006).
5. Permissions minimales (`contents: read`), aucun secret GitHub nécessaire.

## Conséquences
- Budget : 2 000 minutes par mois gratuites pour les dépôts privés. Environ 6 à 9 minutes par exécution, soit environ 200 exécutions par mois. À surveiller si Dependabot et les demandes de fusion se multiplient.
- Si le cabinet passe en **organisation GitHub Team** ou en **Pro** (≈ 4 $ US par mois), activer un ruleset sur `main` : demande de fusion obligatoire, contrôles `app`, `database` et `secrets` requis, pas de force-push. La CI est déjà prête.
- La recherche de secrets « push protection » native de GitHub nécessite Advanced Security (payant) : gitleaks en tient lieu.
