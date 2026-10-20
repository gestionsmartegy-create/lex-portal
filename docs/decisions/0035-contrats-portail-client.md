# ADR 0035 — Contrats dans le portail client et avis de changement des dates de cour

- **Statut** : accepté (2026-10-20). C'est la partie « portail client » du lot 3 du plan `docs/plan-contrats.md`, avec un complément à l'ADR 0028 (dates de cour côté client).
- **Contexte** : le responsable du projet veut que le client voie ses contrats dans son portail et qu'il soit averti de ses dates de cour. Les dates de cour visibles étaient déjà affichées au client et rappelées 7 jours et 1 jour avant (ADR 0028), mais aucun avis ne partait quand une date était ajoutée, déplacée ou annulée.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Qui envoie (décision du 2026-10-20) | **Tout membre de l'équipe du dossier**, adjoint·e·s compris, ainsi que le firm_admin. Pour un contrat sans dossier : son auteur. Il faut tenir le verrou du contrat. |
| 2 | Conditions d'envoi | Le contrat doit être lié à un **client qui a un compte actif** (`client_id`) et n'avoir aucun champ vide. Un brouillon de modèle ne s'envoie pas. |
| 3 | Version figée | `public.contract_send` enregistre une version (« Envoyée au client »), passe le contrat à `sent` et libère le verrou. Le contenu, les sections et les services ne sont plus modifiables (le garde-fou existant n'autorise l'écriture qu'en brouillon ou en relecture). |
| 4 | Signature | Le mode vient du modèle (`clio` ou `portal`), ou se choisit à l'envoi quand le modèle est « au choix » ou absent.<br/>- **Portail** : le client tape son nom complet, coche « J'ai lu ce contrat et je l'accepte » et valide. `public.client_contract_accept` enregistre le nom, la date et l'heure, et passe le contrat à `signed`.<br/>- **Clio** : le client lit le contrat, et l'avocat lance la signature depuis Clio (ADR du 2026-10-15). |
| 5 | Accès du client | Le client ne lit **jamais** `public.contracts`. Il passe par `public.client_contracts()` et `public.client_contract(id)` (security definer), qui renvoient seulement **ses** contrats envoyés, dans la **version figée**, en session client avec double vérification. Un contrat qui n'est pas le sien donne la même 404. Le rendu relit le contenu par la liste blanche (ADR 0032). |
| 6 | Écrans | Côté client :<br/>- entrée « Contrats » dans le menu ;<br/>- `/portal/contracts` (liste : à accepter, à signer dans Clio, accepté) ;<br/>- `/portal/contracts/[id]` (lecture, annexe des services, impression, acceptation) ;<br/>- « Accepter : … » dans « Ce que vous devez faire ».<br/>Côté cabinet, dans l'éditeur : bloc « Envoyer au client », puis « Suivi de l'envoi » (envoyé, consulté, accepté). |
| 7 | Avis | `server/services/client-notifier.ts` (service_role, usage permis : notifications). Il crée une notification dans le portail et envoie un e-mail **sans aucun détail** (seulement le lien), au plus 1 par élément et par destinataire toutes les 15 minutes, selon la préférence e-mail.<br/>- Contrat envoyé : `contract_sent`.<br/>- Date de cour **visible au client** ajoutée, rendue visible, déplacée (y compris par une remise), modifiée (heure, tribunal, salle, format) ou annulée : `court_date_changed`. |
| 8 | Visibilité des dates (décision du 2026-10-20) | Inchangée : une date reste interne tant que l'équipe ne coche pas « visible au client ». |
| 9 | Journal | `contract.sent` (trigger), `contract.viewed` (première consultation), `contract.signed` (trigger) et `contract.accepted` (mode et version, **jamais le nom tapé**). |
| 10 | Corrections (QA et revue de sécurité du 2026-10-20) | Migration `20261022120100_contracts_client_access.sql` :<br/>- un contrat lié à un dossier ne s'envoie qu'à un client qui a un accès **non révoqué** à ce dossier ;<br/>- le client ne voit et n'accepte ce contrat que tant qu'il garde cet accès. Si l'accès est retiré, le contrat disparaît de son portail, comme le dossier (`private.client_sees_contract`) ;<br/>- la version envoyée au client est réduite : jamais `ai_assisted`, `matter_id` ni `client_id`.<br/>Dans l'application :<br/>- l'éditeur se ferme dès l'envoi, sans recharger la page ;<br/>- l'e-mail d'**annulation** d'une date part toujours, même juste après un autre avis (limite de 15 minutes séparée). |

## Conséquences
- **Migrations** `20261022120000_contracts_client.sql` et `20261022120100_contracts_client_access.sql`. La première apporte : 7 colonnes d'envoi et d'acceptation, écrites seulement par les fonctions (indicateur de transaction `lex.contract_flow`, impossible à régler par l'API) ; garde-fou `guard_contract` mis à jour ; 5 fonctions ; 2 types de notification.
- **Tests** :
  - pgTAP `27_contrats_client.test.sql` (32 tests) ;
  - e2e `client-contracts.spec.ts` (envoi, avis, à faire, lecture, acceptation, suivi, 404, avis de date de cour), sur ordinateur et à 375 px, avec axe.
- **Reporté** au reste du lot 3 :
  - PDF figé avec empreinte ;
  - relances ;
  - nouvelle version après envoi ;
  - refus par le client (`declined`).
- **À trancher par le cabinet** : la valeur juridique de l'acceptation dans le portail pour un contrat autre que les conditions générales.
