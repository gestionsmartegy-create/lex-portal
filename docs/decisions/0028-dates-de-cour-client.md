# ADR 0028 — Dates de cour côté client et rappels

- **Statut** : accepté (2026-10-17). C'est le lot 5 du plan « bureaux et calendrier de cour » (story E17).
- **Contexte** : l'avocat peut cocher « Montrer cette date au client » sur une date de cour (ADR 0025). Le client doit alors savoir quand et où se présenter, et être prévenu à temps, sans jamais voir les informations internes du cabinet.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Lecture | `public.client_court_dates(p_matter)` (security definer). Elle renvoie seulement les dates **rendues visibles**, à venir ou de la veille, au statut « à confirmer » ou « confirmée ». Il faut une session client valide, avec double vérification et un accès actif au dossier (`can_read_matter`). Le personnel n'y passe pas.<br>Colonnes : sorte, date, heure, fuseau, tribunal (nom et adresse), salle, format, **lien virtuel** (seulement si l'audience est virtuelle ou hybride), consignes, numéro du dossier.<br>**Jamais** : notes internes, juge, n° de greffe, avocats présents, état Clio.<br>La RLS de `court_dates` est inchangée : aucun accès direct pour le client. |
| 2 | Affichage | Portail, page « Rendez-vous » et onglet « Rendez-vous » du dossier : section « Dates de cour », avec la date dans le fuseau du tribunal, le statut, le lieu, le bouton « Rejoindre l'audience virtuelle » (https seulement, `rel="noopener noreferrer"`) et les consignes. |
| 3 | Rappels | **J-7 et J-1**. Une notification dans le portail donne la date. Un **e-mail sans aucun détail** (ni dossier, ni tribunal, ni heure) invite à se connecter ; il respecte la préférence e-mail du client.<br>Les rappels partent **une seule fois** par date, client et sorte : `private.court_date_reminders` et `public.claim_court_date_reminder`, réservée à service_role.<br>Destinataires revérifiés à chaque envoi : client actif, accès non révoqué.<br>Déclenchement : planificateur (`/api/cron/sync`) et bouton « Synchroniser maintenant ». |
| 4 | Personnel | Les libellés de l'onglet « Cour » précisent que le lien virtuel et les consignes sont montrés au client quand la date lui est visible. |

## Conséquences
- **Migration** : `20261017130000_court_dates_client.sql` (nouveau type de notification `court_date_reminder`).
- **Tests** :
  - pgTAP `23_cour_cote_client` (12 tests) ;
  - intégration `court-reminders.test.ts` : notification, e-mail sans détail, aucun doublon, client dont l'accès a été retiré ;
  - e2e `client-court-dates.spec.ts`, sur ordinateur et à 375 px, avec axe.
- **Serveur de test** : il faut confirmer que le planificateur appelle `/api/cron/sync` régulièrement. En attendant, le bouton « Synchroniser maintenant » envoie les rappels dus.
