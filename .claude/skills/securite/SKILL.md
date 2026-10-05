---
name: securite
description: Lancer l'agent de revue de sécurité (revue-securite) sur la branche courante — vulnérabilités (CVE) des dépendances, routes et actions authentifiées, secrets, liste de contrôle AGENTS.md §7 — ou, avec « dependance <paquet> », évaluer une librairie AVANT de l'ajouter. Rapport en français, bloquant sur les manquements.
---

Deux usages :
- `/securite` — revue complète de la branche, après `/qa` et avant `/sauvegarder`.
- `/securite dependance <paquet>` — avant tout `pnpm add` : vulnérabilités connues, maintenance, popularité, licence, scripts d'installation, redondance avec une librairie déjà présente.

1. Contexte : `git branch --show-current`, `git diff --name-only $(git merge-base origin/main HEAD)`, `git status --short`.
2. Lance l'agent **`revue-securite`** (outil Agent, `subagent_type: revue-securite`). Message : soit `dependance <paquet>` et pourquoi on en a besoin, soit la demande d'origine, le type de changement, les fichiers touchés et les routes, pages ou actions ajoutées ou modifiées.
3. Restitue le rapport **tel quel**, puis ta lecture en trois lignes. Règles :
   - un **❌** se corrige avant d'intégrer dans `main` (`/envoyer-pour-verification` le rappellera) ; en phase de test, il n'empêche pas de sauvegarder ni de déployer sur le serveur de test, mais il reste en tête du rapport ;
   - un **⚠️** se lève à la main : lis le fichier, tranche, et dis pourquoi en une phrase ;
   - la section **📋 Hérité** (code existant hors de la branche) n'est pas à corriger ici : recopie-la dans la description de `/envoyer-pour-verification` pour le responsable technique ;
   - un verdict « À soumettre au responsable technique » : explique, et mets la note en tête de la demande de fusion (en brouillon tant qu'il n'a pas répondu).
4. Pour `dependance` : si le verdict est « peut être ajoutée », rappelle la commande exacte (`pnpm add <paquet>` ou `pnpm add -D <paquet>`) et que le garde-fou demandera une confirmation ; sinon, propose l'alternative déjà présente dans `package.json` ou une implémentation locale de quelques lignes.
