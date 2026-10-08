# Plan de développement — après la rencontre du 2026-10-07

> Source : compte rendu de la rencontre avec le cabinet, puis les demandes du responsable du projet. Chaque phase suit le flux habituel : construction, QA, revue de sécurité, serveur de test, puis demande de fusion.
> Rien n'est construit sur une fonction de Clio ou de Microsoft qui n'est pas confirmée (AGENTS.md §2.6).

## Déjà en place (vérifié)
- **Session** : déconnexion après 30 min d'inactivité, avec avertissement. Passer à 5 ou 10 min est une **décision du cabinet**.
- **Double vérification** obligatoire, et rôles administrateur, avocat et client, avec les droits de l'administrateur listés au compte rendu.
- **Connexion Microsoft du personnel** : développée, à brancher sur l'Azure du cabinet.
- **Version anglaise** complète : reste la relecture par une personne anglophone.
- **Clio** en lecture : dossiers, clients, factures.
- **Modèles de dossiers** (26 types), suivi par étapes, informations du dossier et demandes de documents (ADR 0018 et 0019).

## Phase 1 — Espace « Dossier » unifié *(en cours)*
Une seule page par dossier remplace « Dossiers et accès » et « Suivi du dossier ».
1. **Tableau de bord du dossier** :
   - en-tête : client, type, statut Clio, équipe, avancement ;
   - indicateurs : documents en attente ou en retard, messages non lus, solde dû, prochain rendez-vous, jours sans activité ;
   - sections : étapes, livrables, documents, informations, messages récents, factures, équipe et accès.
2. **Livrables** (nouveau) : ce que le cabinet remet au client, avec date prévue, responsable, état, et visibilité par le client ou non.
3. **Documents reçus** : une demande peut être liée au document reçu, que le cabinet et le client voient et téléchargent.
4. **Fiabilité** : chaque échec d'action (demande de document, etc.) laisse une trace serveur, avec un code seulement.
5. **Assistant d'ouverture d'un dossier** : dossier Clio, type, équipe, client et accès, documents à demander, livrables, en un seul parcours.

## Phase 2 — Suivi de portefeuille, mieux que Clio
- **Étiquettes** en couleur, définies par le cabinet, internes ou visibles par le client.
- **Liste des dossiers** avec filtres combinés (étiquette, type, avocat, statut, étape, retard, inactivité) et **vues enregistrées**.
- **Kanban par type de dossier**, avec une colonne par étape.
- **Demandes de documents globales** (tous les dossiers, actions groupées) et **demande envoyée en une fois à plusieurs dossiers**.
- **Alertes** : dossier inactif, demande en retard, échéance proche.

## Phase 3 — Facturation
- **Détail de chaque facture**, y compris les factures payées : lignes, taxes, paiements, solde. *À confirmer dans l'API Clio (Billing).*
- **PDF de la facture** : *à confirmer dans l'API Clio avant de le promettre.*
- **« Payer »** par lien Clio Payments (permission confirmée), à condition que Clio Payments soit activé chez le cabinet.
- **« Demander une correction » / « Demander un remboursement »** : une demande suivie, envoyée à l'administrateur. L'encaissement et le remboursement restent faits par l'administrateur dans Clio (règle du Barreau).
- **Vue facturation côté cabinet.**
- **QuickBooks** : intégration native Clio (environ 38 $ US par mois), sans développement (recommandé).

## Phase 4 — Ressources et rédaction
- **Espace « Ressources »** : modèles de documents bilingues par domaine, champs automatiques remplis avec les informations du dossier, bibliothèque de clauses, guides et listes de contrôle, versions.
- **Dans un dossier**, un bouton « Nouveau document » permet de choisir un modèle enregistré, puis :
  - l'éditeur ;
  - l'export en PDF ;
  - le **dépôt automatique dans le dossier Clio** (API Documents, confirmée).
- **Signature, option A** : le document est déposé dans Clio, puis l'avocat clique « Envoyer pour signature » dans Clio. Clio ne permet pas de lancer sa signature par l'API (vérifié le 2026-10-07).

## Phase 5 — Signature en un clic (option B)
- **Dropbox Sign API**, lancé depuis la plateforme ; la copie signée est déposée automatiquement dans Clio.
- **Prérequis** :
  - un test réel d'un formulaire IRCC (PDF dynamique Adobe) en version d'essai ;
  - un compte API Dropbox Sign créé par le cabinet.

## Phase 6 — Assistant de rédaction (IA)
- Premier jet à partir d'un modèle, révision, traduction FR ↔ EN, vérification avec la liste de contrôle du domaine.
- **Règles** :
  - appels faits par le serveur seulement ;
  - l'avocat valide toujours ;
  - document marqué « généré par IA, à réviser » ;
  - audit sans contenu ;
  - plafond de coût mensuel.
- **Décision du cabinet** : fournisseur (Azure OpenAI dans une région canadienne recommandé, ou API OpenAI) et données envoyées.

## Phase 7 — Calendrier Microsoft et charge de travail
- **Outlook (Microsoft 365)** comme calendrier de référence, par Microsoft Graph ; Clio se synchronise déjà avec Outlook.
- **Échéances** : audiences, délais de prescription, préparation de documents, avec rappels, en double alerte (Outlook et plateforme). L'avocat confirme chaque délai.
- **Bureaux** (Halifax, Hamilton, etc.) et **charge de travail** par avocat, par bureau et par domaine.
- **Prérequis** : un enregistrement Azure limité aux seuls agendas nécessaires, et la liste des bureaux.

## Phase 8 — Carrières
- Page « Rejoindre notre réseau ». Recommandation : sur le site public. Pas de dépôt de CV au départ.

## Mise en service (dès que les accès sont fournis)
- Connexion Microsoft du personnel, vrais e-mails (Microsoft 365), adresse de réservation Clio, vrai Clio sur la préproduction.

## Décisions à obtenir du cabinet
1. Durée d'inactivité (30, 10 ou 5 min).
2. Documents : Clio Documents comme dépôt principal, ou Clio et SharePoint.
3. Écriture vers Clio : documents, notes, échéances.
4. QuickBooks : intégration Clio à 38 $ US par mois.
5. Signature : option B (Dropbox Sign API), après le test IRCC.
6. IA : fournisseur et données autorisées.
7. Carrières : site public ou portail.
8. Liste des bureaux et affectation des avocats.
