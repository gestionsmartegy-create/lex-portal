---
name: ajouter
description: « Ajoute ça » — une nouvelle fonctionnalité, un nouvel élément d'écran, une nouvelle information affichée. Le développeur décrit en français ; Claude reformule, confirme, construit sur une branche feat/…, fait la QA et la revue de sécurité, sauvegarde, déploie sur le serveur de test et dit comment tester.
---

L'argument est la demande, en français. Exemple : `/ajouter sur la page Factures, affiche le total des factures impayées en haut de la liste`.

Suis `/developper` avec le type de branche **`feat`**, et ces consignes en plus :

- À l'étape 1, vérifie dans `docs/page-map.md` et `docs/mvp-scope.md` que l'ajout est **prévu dans la phase en cours** (`docs/implementation-roadmap.md`). S'il ne l'est pas, dis-le : c'est une décision du responsable technique, pas la tienne. Propose de lui poser la question avant de continuer.
- Un ajout qui a besoin d'une **donnée qui n'existe pas encore** (nouvelle colonne, nouvelle table) relève de la liste de contrôle « Base de données » de `/developper` §3 : annonce-le clairement à l'étape 2.
- Un ajout qui a besoin d'une **donnée venant de Clio ou de SharePoint** n'utilise que ce qui est marqué « Confirmé » dans `docs/clio-api-mapping.md` ou `docs/sharepoint-integration.md` ; sinon, il passe par le mock existant et le badge « Données de démonstration » (AGENTS.md §2.6, §2.7).
