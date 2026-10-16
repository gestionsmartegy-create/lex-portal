# ADR 0025 — Dates de cour, saisies dans la plateforme et écrites dans Clio

- **Statut** : accepté (2026-10-16). C'est le lot 2 du plan « bureaux et calendrier de cour » (`docs/plan-bureaux-calendrier.md`, stories E5 à E8).
- **Décision du cabinet (2026-10-16)** : une date de cour se saisit **dans la plateforme, qui l'écrit dans Clio**.
- **Vérification de l'API (2026-10-16)** : l'API Clio v4 documente la création, la modification et la suppression d'une entrée de calendrier (`POST`, `PATCH` et `DELETE /calendar_entries`). Une entrée exige un calendrier (`calendar_owner`), un début, une fin et un résumé ; elle peut être liée à un dossier (`matter`). `GET /calendars.json?writeable=true` liste les calendriers où l'on peut écrire.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Données | Table `public.court_dates` : sorte (procès, audience, requête, conférence de gestion, comparution, date limite de dépôt), début et fin, journée entière, **fuseau du tribunal**, tribunal, salle, juge, n° de greffe, format (en personne, virtuel, hybride), lien virtuel (https seulement), notes internes, consignes pour le client, visibilité client, statut, confirmation, date remplacée, motif d'annulation, état de l'écriture dans Clio.<br>Les avocats présents sont dans `public.court_date_attendees`. |
| 2 | Accès | Équipe du dossier ou firm_admin, par la RLS et `assertMatterAccess`. **Le client n'y accède pas** dans ce lot ; sa vue (dates rendues visibles et consignes) viendra au lot 5, par une lecture dédiée. |
| 3 | Confirmation | Une date saisie est « à confirmer ». La confirmation (qui, quand) est **imposée par la base**. Changer la date, l'heure, le fuseau ou le tribunal d'une date confirmée la remet « à confirmer ». **La plateforme ne calcule aucun délai légal**, et l'écran le dit. |
| 4 | Remise et annulation | Remettre une date crée une nouvelle date liée (`replaces_id`) et fige l'ancienne (« remise »). Annuler exige un motif. Il n'y a jamais de suppression. Une date remise, annulée ou tenue ne se modifie plus. |
| 5 | Fuseaux | L'heure est saisie et affichée **dans le fuseau du tribunal** (par défaut, celui du bureau du dossier). Elle est convertie en UTC par `lib/zoned-time.ts`. Changements d'heure gérés : heure inexistante avancée, heure ambiguë = première occurrence. |
| 6 | Écriture dans Clio | Le firm_admin choisit le calendrier Clio des dates de cour (page Intégrations ; `public.set_clio_court_calendar`).<br>Après chaque enregistrement, la date est écrite dans ce calendrier, liée au dossier Clio : création, mise à jour, ou suppression si elle est annulée ou remise.<br>**Ce qui est envoyé** : la sorte, le numéro du dossier, le tribunal, la salle, le juge, le n° de greffe, le lien virtuel et le statut. **Les notes internes ne sont jamais envoyées.**<br>Un dossier sans dossier Clio : « non lié à Clio ». En cas d'échec : « échec », puis nouvelle tentative par le planificateur (`/api/cron/sync`) ou par le bouton « Synchroniser ». Une création n'est jamais rejouée après une erreur 5xx, pour éviter les doublons. |
| 7 | service_role | Il sert uniquement à l'écriture vers Clio et à son état : c'est une synchronisation, usage permis par AGENTS.md §6. Il n'est utilisé qu'après un contrôle d'accès réussi, ou par le planificateur. Le calendrier est lu par `clio_court_calendar_internal()`, réservée à service_role. |
| 8 | Journal | Les triggers écrivent `court_date.created`, `court_date.updated`, `court_date.confirmed`, `court_date.adjourned`, `court_date.cancelled`, `court_date.held`, `court_date.attendee_insert`, `court_date.attendee_delete` et `integration.court_calendar_set`, avec des **identifiants seulement**, jamais les notes ni les consignes. |

## Conséquences
- **Migrations** : `20261016130000_court_dates.sql`, `20261016130100_court_calendar_internal.sql` et `20261016130200_court_dates_hardening.sql`. Cette dernière vient de la revue de sécurité, avant tout déploiement :
  - droits par colonne : l'équipe n'écrit ni la confirmation ni les colonnes de synchronisation Clio ;
  - confirmation conservée par la base ;
  - date remplacée du même dossier ;
  - champs d'une ligne sans caractère de contrôle ;
  - réservation `syncing`.
- **Prérequis pour le vrai Clio** : l'application Clio du cabinet doit avoir la permission **Calendriers en lecture et écriture**. Il faut ensuite **reconnecter Clio** sur le serveur de test, puis choisir le calendrier dans Intégrations.
- **Limite connue** : si Clio répond par une erreur serveur à une création, l'entrée a peut-être été créée quand même. La nouvelle tentative du planificateur peut alors produire un doublon dans Clio, à retirer à la main. La réservation `syncing` empêche les doublons dus aux écritures simultanées.
- **Qui confirme** : aujourd'hui, tout membre de l'équipe du dossier. Réserver la confirmation aux avocats (et non aux adjoints) est une **décision du cabinet**, à prendre.
- Les écritures dans Clio sont journalisées : `court_date.clio_written` et `court_date.clio_deleted`, avec des identifiants seulement.
- **Une modification faite directement dans Clio n'est pas relue** pour l'instant. La plateforme reste la référence, et sa prochaine écriture remplace la version de Clio. La lecture depuis Clio est prévue au lot 4 (E16).
- **Tests** :
  - pgTAP `21_dates_de_cour` (28 tests) ;
  - unitaires `zoned-time.test.ts` (fuseaux et changements d'heure) ;
  - e2e `court-dates.spec.ts`, sur ordinateur et à 375 px, avec axe : saisie à Toronto, confirmation, reconfirmation, remise, annulation, écriture dans le faux Clio, personnel hors équipe sans accès.
