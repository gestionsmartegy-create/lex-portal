---
name: sauvegarder
description: Enregistrer le travail en cours sur la branche courante (feat/…, fix/…) avec un message Conventional Commits en français qui dit ce qui a changé, et l'envoyer sur GitHub. L'argument facultatif est la description. Refuse sur main.
---

1. `git branch --show-current` : `main` → arrête-toi : « On ne sauvegarde jamais sur main. Lance /ajouter, /modifier ou /corriger : une branche sera créée. »
2. `git status --short`. Rien → « Rien à sauvegarder. » et c'est fini.
3. **Rien d'interdit dans la liste** : `.env*` (sauf `.env.example`), `supabase/seed.local.md`, `tests/e2e/_qa-temp.spec.ts`, `.tmp/`, une capture d'écran hors `public/`, `node_modules/`, `.next/`. Si l'un y est : retire-le (`git restore --staged` ou suppression du fichier temporaire) et explique.
4. **Le message**, au format `<type>(<portée>): <description en français>` (AGENTS.md §10) :
   - type : `feat` (ajout ou changement voulu), `fix` (correction), `docs`, `test`, `chore` ;
   - portée d'après les fichiers : `portal`, `admin`, `auth`, `i18n`, `db`, `api`, `ui`, `docs` ;
   - description : l'argument s'il est donné, sinon une phrase du point de vue de l'utilisateur (« total des factures impayées sur la page Factures »). Jamais « fix », « wip », « update », « changements ».
5. `git add -A && git commit -q -m "<message>"` puis `git push -q -u origin <branche>`.
   - Push refusé (« rejected ») : `git pull --rebase origin <branche>` puis repousse. Un conflit ? Ne le résous pas seul : « une version faite ailleurs entre en conflit, il faut l'aide du responsable technique. »
6. Réponds : « Sauvegardé : <message>. » Et, si une demande de fusion est ouverte pour cette branche (`gh pr list --head <branche> --state open`), ajoute : « La demande de fusion est mise à jour ; la CI relance ses contrôles. »
