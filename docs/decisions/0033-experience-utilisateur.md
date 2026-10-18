# ADR 0033 — Expérience utilisateur : « Ma journée », menu regroupé, actions et couleurs harmonisées

- **Statut** : accepté (2026-10-18). Décisions du responsable du projet après une revue critique de la plateforme et des maquettes avant/après (points 1 à 7, plus les sous-menus au survol).
- **Contexte** :
  - la plateforme a grandi par lots : 15 entrées de menu au même niveau, un accueil pensé pour l'administrateur, un journal affiché en codes techniques ;
  - des bandeaux d'explication permanents, plusieurs actions de même poids par ligne, et un rouge qui signifiait aussi « à confirmer » ;
  - côté client, un accueil qui montrait des chiffres plutôt que ce qu'il faut faire.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Accueil du cabinet | « **Ma journée** » (`/admin`) : compteurs, audiences des 14 jours (confirmer en un clic), « À traiter », « À surveiller », « Créer », activité récente lisible (firm_admin). Données sous la session (RLS) ; service `my-day.ts`. |
| 2 | Menu | Trois groupes (`ADMIN_NAV_GROUPS`) et **sous-menus** au survol et au clavier (Dossiers, Calendrier, Contrats, Administration). « Mon agenda » passe dans le sous-menu Calendrier. |
| 3 | Explications | Bandeaux remplacés par une aide **« ? »** (`HelpTip`) : onglet Cour, calendrier de cour, bureaux et tribunaux, accueil. |
| 4 | Actions et couleurs | Une action principale par ligne, les autres dans « ⋯ » (`RowActions`) ; ambre = à confirmer (nouveau ton `warning`), rouge = conflit ou retard, vert = confirmé. État Clio en petit texte. |
| 5 | Recherche et cloche | Recherche **Ctrl K** (dossiers, contrats ; clients pour le firm_admin), action serveur limitée à 120 recherches par 5 minutes, sous la session. Cloche : messages sans réponse, dates à confirmer, conflits, changements Clio, retards. |
| 6 | Accueil client | « **Ce que vous devez faire** » (signatures, documents demandés, factures), puis dossiers, prochaine audience, messages. Plus de « Pas encore synchronisé ». |
| 7 | Boutons | Casse normale, `font-semibold` ; nouvelle variante `outline-marine` pour les actions secondaires. |

## Conséquences
- **Aucune migration**. Toutes les lectures passent par la session (RLS).
- **Tests** :
  - e2e `ux.spec.ts` (Ma journée, sous-menus, Ctrl K, cloche, menu « ⋯ », aide « ? », accueil client), sur ordinateur et à 375 px, avec axe ;
  - e2e existants mis à jour (`admin`, `court-dates`, `court-calendar`).
- **Accessibilité** : sous-menus ouverts aussi au focus (Tab), nommés « Raccourcis : … » (pas de confusion avec les champs de formulaire) ; recherche en `<dialog>` natif (Échap) ; aide « ? » fermée par Échap.
- **À venir** :
  - séance de test avec 2 avocats, 1 adjointe et 2 clients ;
  - même traitement des actions sur les autres listes (étapes, demandes, documents).
