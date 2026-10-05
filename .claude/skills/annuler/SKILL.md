---
name: annuler
description: Revenir sur le dernier changement sauvegardé de la branche courante (une nouvelle version qui défait la précédente, rien n'est perdu) et, si la branche était sur le serveur de test, la redéployer. Ne touche jamais à main ni aux données.
---

1. `git branch --show-current` : `main` → arrête-toi (« rien à annuler sur main d'ici »).
2. Des modifications non sauvegardées (`git status --short`) ? Demande : « Il y a des changements pas encore sauvegardés ; je les mets de côté pour revenir à la dernière version enregistrée ? » Avec un oui : `git stash push -u -m "mis de côté avant annulation $(date +%F-%H%M)"`. Dis que le responsable technique peut les retrouver (`git stash list`).
3. Montre ce qui va être annulé : `git log -1 --format='%s'` → « Je vais annuler : "<message>". D'accord ? » Attends un oui.
4. `git revert --no-edit HEAD` : une nouvelle version qui défait la précédente ; l'historique reste entier. En cas de conflit : `git revert --abort` et « il faut l'aide du responsable technique ».
5. `git push -q origin <branche>`.
6. Si le serveur de test affichait cette branche (la conversation ou `/statut` le dit), lance `/deployer` pour qu'il montre la version d'avant.
7. Réponds : « Annulé : "<message>". Pour l'annuler à son tour, relance /annuler. »
