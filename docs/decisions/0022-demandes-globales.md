# ADR 0022 — Demandes de documents sur tous les dossiers

- **Statut** : accepté (2026-10-08). Demande du responsable : « les demandes de document doivent être sur toutes les matters en même temps ».
- **Contexte** : une demande de document ne se faisait que dossier par dossier, et aucune vue ne regroupait les demandes de tous les dossiers.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Vue globale | `/admin/requests` (personnel) : toutes les demandes des dossiers de l'utilisateur (RLS : ses équipes, ou toutes pour le firm_admin). Filtres : recherche, statut (en attente, en retard à la date d'Halifax, reçue, annulée), étiquette du dossier. Lien vers l'onglet Documents du dossier. |
| 2 | Actions groupées | Relancer le client (au plus une relance par demande toutes les 24 h), marquer reçu, annuler. Chaque demande passe par le service unitaire, qui revérifie l'accès au dossier. Une demande refusée compte comme un échec, sans interrompre le lot. Lot limité à 100 demandes. Relances journalisées (`document_request.reminded`, nombre seulement). |
| 3 | Envoi groupé | `/admin/requests/new` : on filtre les dossiers ouverts (étiquette, type), on coche, puis une demande est créée **pour chaque client ayant un accès actif** à chaque dossier, avec un avis dans le portail. La base exige l'accès actif (trigger existant). Lot limité à 100 dossiers. |
| 4 | Retour | Le résultat (fait, ignoré, en échec) s'affiche en compteurs entiers, validés avant affichage. |

## Conséquences
- Aucune migration : toutes les règles d'accès existantes s'appliquent.
- **Test** : e2e `requests.spec.ts` (envoi groupé à deux dossiers, puis action groupée, avec axe).
