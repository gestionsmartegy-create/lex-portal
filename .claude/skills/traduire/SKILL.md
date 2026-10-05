---
name: traduire
description: Changer ou ajouter un texte visible du portail, en français ET en anglais, sans toucher au code (messages/fr.json et messages/en.json seulement). Le flux est allégé : parité des langues, vérification des types, aperçu, sauvegarde, puis serveur de test si demandé.
---

L'argument est le texte à changer et le nouveau texte, ou la demande en français. Exemples : `/traduire remplace « Mes dossiers » par « Dossiers en cours »` ; `/traduire le bouton Envoyer de la messagerie doit dire « Envoyer au cabinet »`.

1. **Trouver la clé.** `grep -n` du texte actuel dans `messages/fr.json` (ou `messages/en.json`). Plusieurs clés ? Montre-les avec la page où chacune apparaît (`grep` de la clé dans `app/` et `components/`) et demande laquelle. Aucune ? Le texte est peut-être en dur dans un composant : c'est alors `/modifier`, et c'est une anomalie à signaler (AGENTS.md §5).
2. **Proposer les deux versions** : français (québécois, vouvoiement, typographie française : espace avant « : » et « ; », guillemets « ») et anglais (canadien). Attends un « oui ».
3. **Modifier** la clé dans **les deux fichiers**. Une nouvelle clé s'ajoute dans les deux, au même endroit de la hiérarchie. Garde les variables (`{count}`, `{name}`) et la pluralisation ICU telles quelles.
4. **Vérifier** : `pnpm test -- i18n-parity` (les deux langues ont les mêmes clés), `pnpm typecheck`, `pnpm lint`. Puis, si `pnpm dev` tourne, ouvre la page en `/fr` et en `/en` et confirme le rendu (longueur du texte sur mobile 375 px, pas de débordement).
5. `/sauvegarder` avec un message du type `feat(i18n): libellé « Dossiers en cours » sur la page des dossiers`.
6. Propose `/deployer` si le développeur veut le voir sur le serveur de test ; sinon, termine par la page à ouvrir en local dans les deux langues.

La branche doit être une `feat/…` ou `fix/…` : sur `main`, crée `feat/i18n-<slug>` depuis `origin/main` d'abord (voir `/developper` §0).
