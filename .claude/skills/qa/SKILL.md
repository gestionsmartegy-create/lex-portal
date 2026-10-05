---
name: qa
description: Lancer l'agent QA (qa-fonctionnel) sur la branche courante — lint, types, tests, build, pgTAP, intégration, e2e et parcours des pages touchées en FR/EN, bureau et mobile — et rendre le rapport en français. Ne modifie pas le code. L'argument facultatif précise la demande d'origine ou les pages à vérifier.
---

1. Rassemble le contexte : `git branch --show-current`, `git diff --name-only $(git merge-base origin/main HEAD)`, `git status --short`, et la demande d'origine si tu la connais (la conversation, ou l'argument).
2. Lance l'agent **`qa-fonctionnel`** (outil Agent, `subagent_type: qa-fonctionnel`) avec un message qui contient : la demande d'origine en une phrase, le type (Interface / Serveur / Les deux / Base de données), la liste des fichiers touchés, les pages à parcourir (`/en/...` et `/fr/...`) et, si la demande décrit un comportement, le scénario à rejouer (clics, saisies, résultat attendu).
3. Attends son rapport. Vérifie qu'il ne reste pas de `tests/e2e/_qa-temp.spec.ts` (`git status --short`) ; s'il en reste, supprime-le.
4. Restitue le rapport au développeur **tel quel**, puis, en dessous, ta lecture en trois lignes : ce qui est vert, ce qui est rouge, ce qu'on fait maintenant. Si tout est vert : « Prêt pour `/securite`. »

Ne corrige rien dans ce skill : les corrections se font dans le flux `/developper` (au plus deux tours), puis on relance `/qa`.
