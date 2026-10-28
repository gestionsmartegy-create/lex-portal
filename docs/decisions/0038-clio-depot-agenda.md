# ADR 0038 — Clio : dépôt du contrat validé et dates de cour venues de l'agenda Clio

- **Statut** : accepté (2026-10-28). Il couvre la partie Clio de F11 (le dépôt dans SharePoint attend le branchement Microsoft), ainsi que E8 et E16.
- **Contexte** : le contrat validé doit être rangé dans Clio et dans SharePoint (décision du 2026-10-18). Les dates de cour saisies dans Clio doivent arriver seules dans la plateforme.
- **Source** : la capacité a été vérifiée le 2026-10-28 dans la spécification officielle `docs.developers.clio.com/openapi.json` (v4, serveur `ca.app.clio.com`). Voir `docs/clio-api-mapping.md`.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Dépôt | À la validation, la base crée un dépôt par destination dans `public.contract_deposits` :<br/>- **Clio** : « à faire » si le dossier est lié à Clio, sinon « en attente » (`NO_CLIO_MATTER`) ;<br/>- **SharePoint** : « en attente du branchement Microsoft ».<br/>Le planificateur (`/api/cron/sync`, service_role, usage permis : synchronisation) réserve les dépôts avec le PDF officiel (`contract_deposit_claim`), dépose, puis enregistre le résultat (`contract_deposit_result`). |
| 2 | Flux Clio | 1. `POST /documents.json` dans le dossier, ou sur le document précédent du même contrat (ou de la version qu'il remplace) pour en faire une **nouvelle version** ;<br/>2. `PUT` du fichier sur l'URL S3 signée, **côté serveur**, en https et vers un hôte `amazonaws.com` seulement. Seuls les en-têtes `Content-Type` et `x-amz-*` sont transmis, jamais le jeton Clio ;<br/>3. `PATCH fully_uploaded`.<br/>Aucun lien de Clio ni d'Amazon n'est transmis au navigateur. |
| 3 | Mode | `INTEGRATION_MODE_CLIO_DOCUMENTS=mock` par défaut : **aucune écriture dans Clio**, même si la connexion Clio est réelle, tant que le cabinet n'a pas donné son accord. Le dépôt réel exige `INTEGRATION_MODE_CLIO=live` **et** `INTEGRATION_MODE_CLIO_DOCUMENTS=live`. |
| 4 | Échecs | Nouvelle tentative avec un délai croissant (5, 20, 45, 80 minutes…). Après 5 essais, l'état passe à « échec », signalé dans « Ma journée → À traiter ». L'équipe peut « Réessayer ». Journal : `contract.deposited` et `contract.deposit_failed`, avec seulement le code d'erreur. |
| 5 | Écrans | Dans l'éditeur du contrat, « Rangement du contrat » montre l'état par destination. « Ouvrir le dossier dans Clio (signature) » apparaît avec la connexion réelle seulement. |
| 6 | Agenda Clio (E8) | Onglet « Cour » du dossier → « Agenda Clio du dossier » : les rendez-vous à venir, lus dans Clio (`calendar_entries?matter_id`). « Importer » relit l'entrée dans Clio (jamais ce que le navigateur envoie) et crée une date de cour **« à confirmer »**, déjà liée à son entrée Clio (`source = 'clio'`, synchronisée) : elle n'est **jamais recréée dans Clio**. Le changement d'heure dans Clio reste signalé par le mécanisme de l'ADR 0031. |
| 7 | Import automatique (E16), décision du 2026-10-28 | Le planificateur relit l'agenda de 20 dossiers liés par passage, les plus anciens d'abord (`updated_since`, avec 10 minutes de chevauchement). Il importe **seulement les rendez-vous dont le type d'événement Clio est « Cour » / « Court »**. Les avocats doivent donc choisir ce type dans Clio. La sorte de date (audience, procès, requête…) est devinée d'après le titre ; par défaut, « audience ». Les autres rendez-vous restent importables à la main. |
| 8 | Accès | `matters.clio_matter_id` n'est pas lisible par l'API (ADR 0009). L'équipe le lit par `public.matter_clio_id`, qui revérifie l'accès. L'import est réservé à l'équipe du dossier (ou au planificateur). Les fonctions du planificateur ne sont exécutables que par service_role. |
| 9 | Corrections (QA et revue de sécurité du 2026-10-28) | **Simulateur** :<br/>- le planificateur ne réserve ni ne marque « déposé » aucun dépôt tant que le dépôt réel n'est pas autorisé ; l'écran affiche « en attente de l'accord du cabinet » ;<br/>- l'import automatique ne tourne pas avec le faux Clio (aucune fausse audience).<br/>**Envoi du fichier** : hôte S3 d'Amazon seulement, port par défaut, aucune redirection suivie ; une fin de dépôt introuvable (404) est un échec. Si la fin du dépôt échoue après l'envoi, l'essai suivant recrée le document : un doublon est possible dans Clio, il faut le retirer à la main.<br/>**Base** (migration `20261025120300`) :<br/>- verrou par entrée Clio à l'import ;<br/>- relance journalisée (`contract.deposit_retried`) ;<br/>- un dépôt sans PDF échoue proprement.<br/>**Écran** : aide de l'agenda conforme à la règle « type Cour » ; nom accessible par ligne. |


## Conséquences
- **Migrations** :
  - `20261025120000_clio_deposits_agenda.sql` ;
  - `20261025120100_court_dates_clio_entry_index.sql` ;
  - `20261025120200_matter_clio_link.sql` ;
  - `20261025120300_clio_review.sql`.
- **Variable** : `INTEGRATION_MODE_CLIO_DOCUMENTS` (`.env.example`, nom seulement).
- **Tests** :
  - pgTAP `30_clio_depot_agenda.test.sql` (30 tests) ;
  - unitaires : flux de dépôt et refus d'une URL autre que S3, lecture de l'agenda, reconnaissance des dates de cour ;
  - e2e `clio-depot-agenda.spec.ts`.
- **À faire avec le cabinet** :
  - autoriser le dépôt réel ;
  - vérifier le flux sur le compte Clio de test (permission « Documents » en écriture) ;
  - choisir éventuellement un sous-dossier Clio pour les contrats ;
  - définir le dépôt SharePoint, avec Microsoft.
- **À soumettre au responsable technique** : `court_date_import_clio` reste appelable par l'équipe du dossier avec une date fournie par l'appelant (en contournant l'application, qui, elle, relit l'entrée dans Clio). L'impact est limité : la personne peut déjà créer des dates. Restreindre ce droit changerait la RLS.
