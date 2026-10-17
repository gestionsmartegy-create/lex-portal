# ADR 0029 — Charge de travail par avocat, bureau, tribunal et domaine

- **Statut** : accepté (2026-10-17). C'est le lot 6 du plan « bureaux et calendrier de cour » (story E18).
- **Contexte** : le cabinet veut répartir les dossiers et les audiences entre les avocats et les bureaux (Moncton, Ottawa, Halifax, Montréal).

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Page | `/admin/workload`, réservée au **firm_admin**. Période : 30 ou 90 prochains jours. Filtre par bureau du dossier. |
| 2 | Par avocat | Dossiers ouverts (équipe), dont il est responsable ; dates de cour où il est présent ; conflits d'horaire (même règle que le calendrier de cour) ; livrables à remettre dont il est responsable. Un clic ouvre son calendrier de cour. |
| 3 | Par bureau, tribunal, domaine | Dossiers ouverts et dates de cour par bureau ; dates de cour par tribunal ; dossiers ouverts par type de dossier. |
| 4 | Données | **Compteurs seulement**, aucun contenu de dossier. Lecture sous la session du firm_admin (RLS), sans service_role ni migration. Agrégation en mémoire, plafonnée à 2 000 lignes par source, avec un avertissement si la limite est atteinte. |

## Conséquences
- **Tests** :
  - unitaires `workload.test.ts` (agrégation, conflits, filtre par bureau) ;
  - e2e `workload.spec.ts`, sur ordinateur et à 375 px, avec axe. Il vérifie aussi que la page est refusée au personnel.
- **À venir** : une vue « charge » pour chaque avocat. Une heure de travail estimée par dossier n'existe pas encore (temps facturé dans Clio).
