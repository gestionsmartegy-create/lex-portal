# ADR 0026 — Calendrier de cour

- **Statut** : accepté (2026-10-16). C'est le lot 3 du plan « bureaux et calendrier de cour » (stories E9 à E13).
- **Contexte** : les dates de cour sont saisies dans chaque dossier (ADR 0025). Il manquait une vue d'ensemble : tout le cabinet, par bureau, par avocat ou par tribunal, avec les conflits d'horaire et les dates à venir.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Page | `/admin/court-calendar` (personnel), en vue **mois**, **semaine** ou **liste** (30 jours). La période et les filtres sont dans l'adresse de la page.<br>Le firm_admin a la **vue générale** du cabinet. Le personnel voit les dossiers de ses équipes (RLS inchangée). |
| 2 | Filtres | Bureau du dossier, avocat présent, tribunal, type, statut (à venir et tenues, à confirmer, toutes), « mes dossiers ». |
| 3 | Fuseaux | Chaque date est placée au jour de son fuseau (celui du tribunal) et affichée avec l'abréviation du fuseau (« 9 h 30 HNE »). |
| 4 | Conflits | Un même avocat présent à deux dates actives qui se chevauchent, ou séparées de moins de **60 minutes dans deux tribunaux différents**. Ils sont signalés en rouge dans le calendrier et sur l'accueil.<br>Les journées entières et les dates annulées ou remises ne comptent pas. Seules les dates visibles par l'utilisateur sont comparées (RLS). |
| 5 | Accueil | Panneau « Dates de cour des 14 prochains jours », qui signale les dates à confirmer et les conflits. Il tient lieu de rappel dans la plateforme. |
| 6 | Téléphone | Les grilles du mois et de la semaine sont remplacées par la liste par jour sous 768 px. Le nom complet de chaque jour est lu par les lecteurs d'écran. |

## Conséquences
- **Aucune migration** : le calendrier lit les tables existantes, sous la RLS.
- **Rappels** : il n'y a pas encore de rappel envoyé (J-30, J-7, J-1). L'espace cabinet n'a pas d'écran de notifications. Le panneau de l'accueil et le calendrier en tiennent lieu. Les rappels dans Outlook viendront avec le lot 4 (connexion des agendas).
- **Vues enregistrées du calendrier** : ce n'est pas fait dans ce lot. Les filtres restent dans l'adresse, qu'on peut mettre en favori.
- **Tests** :
  - unitaires `court-calendar.test.ts` (périodes et conflits) ;
  - e2e `court-calendar.spec.ts`, sur ordinateur et à 375 px, avec axe : liste, mois, semaine, filtres, conflit, accueil, version FR, personnel hors équipe.
