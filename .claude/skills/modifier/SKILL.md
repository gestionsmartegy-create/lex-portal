---
name: modifier
description: « Change ça » — modifier le comportement ou l'apparence d'un élément qui existe déjà (ordre, libellé, couleur, règle d'affichage, formulaire). Claude montre d'abord ce que fait le code actuel, confirme le changement, puis suit le flux complet (QA, sécurité, sauvegarde, serveur de test, comment tester).
---

L'argument est la demande, en français. Exemple : `/modifier sur la fiche d'un dossier, mets les documents avant les rendez-vous`.

Suis `/developper` avec le type de branche **`feat`** (ou **`fix`** si la demande corrige un comportement qui n'était pas voulu), et ces consignes en plus :

- Avant de reformuler (étape 1), **trouve le code actuel** (`grep` du libellé dans `messages/fr.json` pour obtenir la clé, puis `grep` de la clé dans `app/` et `components/`) et **décris en une phrase ce qu'il fait aujourd'hui**. Le développeur doit voir « avant → après ».
- Si le libellé seul change, c'est `/traduire` : propose-le, c'est plus court et plus sûr.
- Si la modification change une **règle d'accès** (qui voit quoi), ce n'est pas une modification d'interface : refuse et renvoie au responsable technique (AGENTS.md §2.4, §2.9).
- Un composant de `components/ui/` (shadcn) est partagé par tout le site : une modification s'y répercute partout. Préfère une variante ou une classe locale, et dis pourquoi.
