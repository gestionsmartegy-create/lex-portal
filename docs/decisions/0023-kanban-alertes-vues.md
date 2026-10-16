# ADR 0023 — Tableau par étape, panneau « À surveiller » et vues enregistrées

- **Statut** : accepté (2026-10-09). C'est la fin de la phase 2 de `docs/plan-developpement.md` (« suivi de portefeuille, mieux que Clio »).
- **Contexte** :
  - le portefeuille (ADR 0021) n'existait qu'en liste ;
  - les retards n'étaient visibles qu'en filtrant ;
  - il fallait refaire les mêmes filtres à chaque visite.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Tableau par étape (Kanban) | `/admin/matters?view=board&type=…` affiche les dossiers d'un type en colonnes, une par étape du modèle du type (ADR 0019).<br>**Colonne d'un dossier** : son étape en cours, c'est-à-dire la première non terminée. Elle est rattachée à l'étape du modèle qui a le même titre (FR ou EN).<br>**Colonnes complémentaires**, affichées seulement si elles ne sont pas vides : « Pas encore d'étapes », « Autre étape » (titre hors modèle) et « Toutes les étapes terminées ».<br>Les filtres du portefeuille s'appliquent aussi au tableau.<br>Le tableau est en **lecture seule** : on fait avancer un dossier depuis son espace (onglet Étapes), pour que chaque changement passe par les contrôles et l'audit existants. Il n'y a donc pas de glisser-déposer. |
| 2 | « À surveiller » | Panneau sur l'accueil de l'espace cabinet (personnel et firm_admin), qui regroupe :<br>• les demandes de documents en retard ;<br>• les demandes attendues dans les 7 jours ;<br>• les livrables en retard ;<br>• les livrables prévus dans les 7 jours ;<br>• les dossiers sans activité depuis 14 jours.<br>Les dates sont calculées à Halifax et les dossiers fermés sont exclus. Chaque groupe montre au plus 8 éléments, avec un lien « Tout voir ». Les données sont lues sous RLS : le panneau ne montre que les dossiers des équipes de l'utilisateur. |
| 3 | Vues enregistrées | Nouvelle table `public.matter_saved_views` (nom et filtres), **personnelle** : la RLS limite tout au propriétaire et au personnel.<br>Le serveur **revalide les filtres** et ne conserve que les filtres connus, sous forme canonique. En base, une contrainte limite la chaîne au jeu de caractères d'URL.<br>Il y a au plus 20 vues par personne : le service le vérifie, et un trigger de la base le garantit (avec un verrou par propriétaire contre les envois simultanés). Une vue n'apporte aucun droit : en l'ouvrant, on relance une requête filtrée par la RLS. |

## Conséquences
- **Migrations** : `20261009120000_saved_views.sql` (table, RLS et droits explicites) et `20261009120100_saved_views_limit.sql` (plafond de 20 vues).
- **Tests** :
  - pgTAP `19_vues_enregistrees` (16 tests, dont personnel connecté par mot de passe, modification refusée et 21e vue refusée) et test unitaire `saved-views.test.ts` (filtres canoniques) ;
  - e2e `board.spec.ts`, sur ordinateur et à 375 px, avec axe : colonnes, vue enregistrée puis retirée, panneau « À surveiller », version FR.
- **Pas d'audit des vues enregistrées** : ce sont des préférences d'affichage, pas des actions sensibles (AGENTS.md §2.8).
- **Sur téléphone** : les colonnes s'empilent et les colonnes vides sont masquées.
