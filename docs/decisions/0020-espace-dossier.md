# ADR 0020 — Espace « Dossier » unifié

- **Statut** : accepté (2026-10-08). Demande du responsable du projet après la rencontre du 2026-10-07 : « gestion de projet » et « dossiers et accès » réunis.
- **Contexte** : l'avocat passait de « Dossiers et accès » à « Suivi du dossier » et n'avait aucune vue d'ensemble. Il n'existait pas de notion de livrable. Une demande de document ne pouvait pas montrer le document reçu.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Une page par dossier | `/admin/matters/[id]`, avec des onglets : **Vue d'ensemble**, Étapes et livrables, Documents, Équipe et accès, Informations du dossier. Les anciennes adresses `/tracking` et `/access` redirigent vers l'onglet correspondant. Accès : équipe du dossier ou firm_admin, même 404 sinon. La gestion des accès clients reste réservée au firm_admin. |
| 2 | Tableau de bord | Indicateurs : documents en attente (et en retard), conversations non lues, solde dû (calcul en centimes entiers), prochain rendez-vous, livrables en cours, dernière activité (alerte au-delà de 14 jours). Sections : prochaines étapes, livrables à venir, demandes en retard, conversations récentes, factures. |
| 3 | Livrables | `matter_deliverables` (migration `20261008120000`) : titre, description, date prévue, responsable (personnel), état (prévu, en cours, remis, annulé), visibilité par le client. RLS : équipe ou firm_admin en écriture ; le client lit seulement les livrables visibles. L'auteur, le dossier et la date de remise sont tenus par la base. Tout est journalisé, avec les identifiants seulement. |
| 4 | Document reçu | Une demande peut être liée à un document **du même dossier** (trigger). Elle passe alors à « reçue ». Le cabinet voit et télécharge le document depuis la demande. |
| 5 | Fiabilité | Chaque échec de création d'une demande ou de modification d'un livrable laisse une trace serveur (code seulement). L'onglet d'origine est conservé après chaque action. |

## Conséquences
- **À venir** :
  - l'assistant d'ouverture d'un dossier (plan, phase 1.5) ;
  - les livrables affichés dans le portail client ;
  - les étiquettes et le Kanban (phase 2).
- **Tests** : pgTAP `17_espace_dossier` (16 cas) ; e2e « espace Dossier unifié » (vue d'ensemble, livrable, document lié, axe).
