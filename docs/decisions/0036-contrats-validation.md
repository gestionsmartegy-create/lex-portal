# ADR 0036 — Contrats : validation, PDF officiel, relecture, relance, refus et nouvelle version (lot 3)

- **Statut** : accepté (2026-10-21). C'est la fin du lot 3 du plan `docs/plan-contrats.md` (stories F7, F8, F9 et F10), qui fait suite aux ADR 0032, 0034 et 0035.
- **Contexte** : l'envoi au client existait (ADR 0035), mais sans étape de validation, sans document officiel et sans suivi après l'envoi.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Qui valide (décision du 2026-10-21) | **Tout avocat de l'équipe** du dossier (responsable, d'origine ou collaborateur) et le firm_admin. Un contrat **sans dossier** n'est validé que par le **firm_admin** (décision du 2026-10-21 : le portail ne sait pas qui est avocat hors de l'équipe d'un dossier). Les adjoint·e·s préparent mais ne valident pas. La règle est revérifiée par la base (`private.is_contract_lawyer`). |
| 2 | Validation | Elle est bloquée s'il reste un champ vide. Elle exige le verrou.<br/>`public.contract_validate` fige une version, enregistre le **PDF officiel** dans `private.contract_pdfs` et calcule son **empreinte SHA-256 dans la base** (`extensions.digest`). L'empreinte n'est jamais reçue de l'application.<br/>Le fichier doit commencer par `%PDF-` et peser au plus 5 Mo. Journal : `contract.pdf_generated`. |
| 3 | PDF | Il est produit côté serveur par **pdfkit 0.20.2**, épinglé (revue de dépendance du 2026-10-21 : `pdf-lib` est écartée, plus maintenue depuis 2021).<br/>Polices standard uniquement (noms fixes), aucun JavaScript, aucune pièce jointe, aucun lien construit depuis le contenu. Le contenu vient de la liste blanche (ADR 0032).<br/>Pied de page : version, date de validation, page X / Y. Format **PDF seulement** pour l'instant (décision du 2026-10-21) ; Word plus tard. |
| 4 | Téléchargement | `/api/contracts/[id]/pdf`, en flux depuis la base. Il exige une session ; pour le personnel, l'accès au dossier est vérifié d'abord.<br/>`public.contract_pdf` décide : l'équipe, ou le client destinataire, qui reçoit la version envoyée. Même 404 pour tout refus. Journal : `contract.pdf_downloaded`. |
| 5 | Envoi | Seulement un contrat **validé** ; la version envoyée est la version validée. Tout membre de l'équipe peut l'envoyer (ADR 0035).<br/>Un client invité après la rédaction est retrouvé d'après le courriel de la fiche (compte client actif et visible), puis lié au contrat.<br/>« Revenir au brouillon » retire la validation tant que le contrat n'est pas envoyé. |
| 6 | Relecture | `public.contract_comments` : commentaires par section ou sur tout le contrat, ajoutés par l'équipe et marqués « réglé » ou rouverts.<br/>RLS : équipe du contrat. Le client n'y a jamais accès. Le texte est simple, jamais du HTML. Limite : 60 commentaires par 10 minutes. |
| 7 | Relance | Au plus une par jour (`public.contract_remind`, revérifié par la base). Le client reçoit un nouvel avis dans le portail et un e-mail sans détail. Journal : `contract.reminded`. |
| 8 | Refus | Le client peut refuser un contrat envoyé (`public.client_contract_decline`), avec un motif facultatif de 500 caractères au plus, **jamais journalisé**. Le contrat reste visible, marqué « Refusé ». |
| 9 | Nouvelle version | Après l'envoi ou un refus, `public.contract_new_version` crée un brouillon qui reprend la fiche, les sections et les services (le lien au modèle n'est gardé que s'il est encore publié). L'ancien contrat passe « Remplacé », disparaît du portail du client et pointe vers le nouveau. |
| 10 | Après acceptation (F10) | Le firm_admin rattache un contrat accepté sans dossier à un dossier (`public.contract_link_matter`), puis « Ouvrir le dossier » (`/admin/matters/new?matterId=`). |
| 11 | Client sans compte | Le firm_admin voit « Inviter ce client ». La page d'invitation relit la fiche du contrat côté serveur : aucune donnée personnelle ne passe dans l'URL, seulement l'identifiant du contrat. Les autres voient « Demandez à un administrateur ». |
| 12 | Corrections (QA et revue de sécurité du 2026-10-21) | Migration `20261023120200_contracts_lot3_review.sql` :<br/>- **aperçu du destinataire** avant l'envoi (`public.contract_client_account`, affiché et confirmé : « Envoyer ce contrat à Prénom Nom (courriel) ? ») ;<br/>- liaison du compte journalisée (`contract.client_linked`, identifiants seulement) ;<br/>- `contract.pdf_downloaded` écrit seulement si un PDF est renvoyé ;<br/>- date de résolution d'un commentaire non réécrivable ;<br/>- rattachement à un dossier seulement si le client y a accès ;<br/>- une nouvelle version d'un contrat de démonstration reste marquée.<br/>Dans l'application :<br/>- 10 validations par personne et par 10 minutes ;<br/>- nombres affichés à la française (virgule) dans le PDF et à l'écran ;<br/>- ordre fixe des taxes (TPS, TVH, TVP, TVQ) ;<br/>- lien « version précédente » souligné (accessibilité).<br/>Le numéro de version du pied de page ne peut pas diverger de celui de la base : la validation exige le verrou, et aucune autre version ne peut être enregistrée pendant ce temps. |

## Conséquences
- **Migrations** `20261023120000_contracts_lot3.sql`, `20261023120100_contracts_lot3_link.sql` et `20261023120200_contracts_lot3_review.sql`.
- **Dépendances** : `pdfkit` 0.20.2 et `@types/pdfkit` 0.17.6 (développement), épinglées.
- **Tests** :
  - pgTAP `28_contrats_lot3.test.sql` (43 tests) ; `27_contrats_client.test.sql` adapté (envoi après validation) ;
  - unitaires `contract-pdf.test.ts` ;
  - e2e `contracts-lot3.spec.ts` (relecture par un·e adjoint·e, validation et PDF, envoi, relance, PDF côté client, refus, nouvelle version), sur ordinateur et à 375 px, avec axe ;
  - e2e `client-contracts.spec.ts` adapté.
- **Reporté** :
  - export Word ;
  - dépôt du PDF dans Clio et SharePoint (lot 4) ;
  - désignation d'un relecteur précis.
- **Risque accepté** : un membre du personnel autorisé à valider pourrait, en appelant l'API lui-même, enregistrer un PDF différent du texte. La version figée est conservée à côté du PDF, ce qui permet de détecter l'écart, et l'action est journalisée.
- **Tests e2e** : les contrats créés par les tests ne peuvent pas être supprimés à la fin (le PDF officiel est en `on delete restrict` dans le schéma `private`), ils restent dans la base locale jusqu'au prochain `pnpm db:reset`.
