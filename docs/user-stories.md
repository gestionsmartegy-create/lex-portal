# User stories et recette — Portail Client Lex Canada

> Chaque story a des **critères d'acceptation** vérifiables et le **test automatisé** qui la couvre.
> Elles servent de **check-list de recette** pour la préproduction (lundi 5 octobre 2026) : cochez chaque critère en le vérifiant vous-même dans le navigateur.
> Rôles : **Client** (compte invité), **Personnel** (membre du cabinet, connexion Microsoft), **Admin** (firm_admin).
> **Chaque story est une issue GitHub** (étiquette `user-story`) : cliquez sur son identifiant. On coche les critères et on commente les résultats de recette dans l'issue ; ce fichier sert d'index.
> Légende des statuts : ✅ livré et testé · 🟡 livré sur données de démonstration · ⏳ phase suivante.

## A. Accès et sécurité

| # | Story | Critères d'acceptation | Test | Statut |
|---|---|---|---|---|
| [A1](https://github.com/SmartegyCanada/lex-portal/issues/18) | En tant qu'**Admin**, je veux inviter un client sur un ou plusieurs dossiers, pour qu'il accède à son espace sans créer de compte lui-même. | <ul><li>L'e-mail part avec un lien à usage unique, valable 72 h, sans aucune donnée de dossier.</li><li>Un lien expiré ou réutilisé est refusé, avec un message neutre.</li><li>Une adresse du cabinet est refusée.</li></ul> | `admin.spec.ts` (invitation), `auth.test.ts` (jeton) | ✅ |
| [A2](https://github.com/SmartegyCanada/lex-portal/issues/19) | En tant que **Client**, je veux activer mon compte et sécuriser l'accès par un code, pour que personne d'autre ne voie mes dossiers. | <ul><li>Mot de passe de 12 caractères ou plus, avec 4 types de caractères.</li><li>Enrôlement TOTP obligatoire, par QR code ou par clé.</li><li>Aucun dossier n'est visible avant la saisie du code (`aal2`).</li></ul> | `auth.test.ts`, `auth.spec.ts` | ✅ |
| [A3](https://github.com/SmartegyCanada/lex-portal/issues/20) | En tant que **Client**, je veux me connecter avec mon mot de passe puis mon code. | <ul><li>Un mauvais mot de passe affiche un message neutre (on ne sait pas si le compte existe).</li><li>Après 8 échecs, la connexion est bloquée 15 min.</li></ul> | `auth.spec.ts` | ✅ |
| [A4](https://github.com/SmartegyCanada/lex-portal/issues/21) | En tant que **Client**, je veux être déconnecté si je m'absente, pour protéger mes dossiers sur un poste partagé. | <ul><li>Avertissement à 28 min, avec un compte à rebours de 2:00.</li><li>« Rester connecté » prolonge la session.</li><li>À 30 min : déconnexion et message.</li><li>Durée maximale : 12 h.</li></ul> | `auth.spec.ts` (expiration), `11_sessions.test.sql` | ✅ |
| [A5](https://github.com/SmartegyCanada/lex-portal/issues/22) | En tant que **Client** ayant perdu mon téléphone, je veux savoir comment retrouver l'accès. | <ul><li>La page explique d'appeler le cabinet.</li><li>Aucune réinitialisation en ligne.</li></ul> | `auth.spec.ts` (téléphone perdu) | ✅ |
| [A6](https://github.com/SmartegyCanada/lex-portal/issues/23) | En tant qu'**Admin**, je veux réinitialiser la double vérification d'un client après avoir vérifié son identité. | <ul><li>Les facteurs sont supprimés et les sessions coupées.</li><li>Le mot de passe est remplacé, et le client reçoit un e-mail pour en choisir un nouveau.</li><li>L'opération est journalisée.</li><li>Elle est refusée pour le personnel.</li></ul> | `sessions-mfa.test.ts` | ✅ |
| [A7](https://github.com/SmartegyCanada/lex-portal/issues/24) | En tant que **Client**, je veux être averti par e-mail de tout changement de sécurité sur mon compte. | Alerte bilingue (mot de passe, e-mail, MFA), sans lien. | `auth.test.ts` (alertes) | ✅ |
| [A8](https://github.com/SmartegyCanada/lex-portal/issues/25) | En tant que **Personnel**, je veux me connecter avec mon compte Microsoft du cabinet. | <ul><li>Seul le tenant du cabinet est accepté.</li><li>Un mot de passe ne donne jamais de droits au personnel.</li></ul> | `auth.test.ts`, `02_identite.test.sql` | 🟡 en attente de la configuration Azure |

## B. Portail client

| # | Story | Critères d'acceptation | Test | Statut |
|---|---|---|---|---|
| [B1](https://github.com/SmartegyCanada/lex-portal/issues/26) | En tant que **Client**, je veux un tableau de bord qui me montre l'essentiel. | <ul><li>Action la plus urgente en bandeau.</li><li>4 indicateurs : dossiers actifs, documents en attente, messages non lus, solde.</li><li>Dossiers et messages récents.</li><li>Date de mise à jour visible.</li></ul> | `portal.spec.ts` (écrans) | 🟡 |
| [B2](https://github.com/SmartegyCanada/lex-portal/issues/27) | En tant que **Client**, je veux voir la liste de mes dossiers et leur avancement. | <ul><li>Filtres « tous », « en cours », « clos ».</li><li>Statut et pourcentage d'avancement.</li><li>**Uniquement** mes dossiers.</li></ul> | `portal.spec.ts`, `03_acces_dossiers.test.sql` | 🟡 |
| [B3](https://github.com/SmartegyCanada/lex-portal/issues/28) | En tant que **Client**, je veux le détail d'un dossier : vue d'ensemble, chronologie, documents, messages, factures et rendez-vous. | <ul><li>6 onglets.</li><li>Le dossier d'un autre client donne « page introuvable », la même réponse qu'un dossier inexistant.</li></ul> | `portal.spec.ts` (404) | 🟡 |
| [B4](https://github.com/SmartegyCanada/lex-portal/issues/29) | En tant que **Client**, je veux consulter et télécharger mes documents. | <ul><li>3 dossiers : partagés, mes dépôts, signés.</li><li>Téléchargement direct, journalisé.</li><li>Un document **interne** du cabinet n'apparaît jamais.</li></ul> | `portal.spec.ts` (téléchargement, interne) | 🟡 SharePoint en Phase 3 |
| [B5](https://github.com/SmartegyCanada/lex-portal/issues/30) | En tant que **Client**, je veux voir les pièces demandées et les documents à signer. | <ul><li>Liste avec échéances.</li><li>Dépôt et signature en ligne annoncés « bientôt ».</li></ul> | `portal.spec.ts` | 🟡 ⏳ dépôt (Phase 3), signature (Phase 4) |
| [B6](https://github.com/SmartegyCanada/lex-portal/issues/31) | En tant que **Client**, je veux échanger des messages avec mon équipe juridique. | <ul><li>Fils par dossier, non-lus signalés.</li><li>Réponse seulement avec l'accès « lecture et réponse ».</li><li>Le contenu n'est jamais journalisé.</li></ul> | `portal.spec.ts` (lecture seule) | ✅ |
| [B7](https://github.com/SmartegyCanada/lex-portal/issues/32) | En tant que **Client**, je veux voir mes factures et mon solde. | <ul><li>Montants exacts en CAD.</li><li>Statuts « à payer » et « payée ».</li><li>Bouton « Payer » visible mais désactivé.</li></ul> | `portal.spec.ts`, `format.test.ts` | 🟡 ⏳ paiement (Phase 4) |
| [B8](https://github.com/SmartegyCanada/lex-portal/issues/33) | En tant que **Client**, je veux voir mes rendez-vous et les ajouter à mon agenda. | <ul><li>À venir et passés, à l'heure de l'Atlantique.</li><li>Lien de la rencontre.</li><li>Export `.ics`.</li></ul> | `portal.spec.ts`, `format.test.ts` | 🟡 |
| [B9](https://github.com/SmartegyCanada/lex-portal/issues/34) | En tant que **Client**, je veux recevoir et gérer mes notifications. | <ul><li>Cloche avec compteur.</li><li>Liste typée urgent / info / succès.</li><li>« Tout marquer comme lu ».</li></ul> | `portal.spec.ts` | ✅ |
| [B10](https://github.com/SmartegyCanada/lex-portal/issues/35) | En tant que **Client**, je veux gérer mon profil, ma langue et ma sécurité. | <ul><li>Nom, téléphone, langue FR/EN, préférence d'e-mail.</li><li>Changement de mot de passe.</li><li>« Déconnecter tous les appareils ».</li></ul> | `portal.spec.ts` | ✅ |
| [B12](https://github.com/SmartegyCanada/lex-portal/issues/48) | En tant que **Client**, je veux être averti qu'un nouveau message m'attend. | <ul><li>Notification dans la cloche, avec un lien vers le fil.</li><li>E-mail d'avis bilingue **sans le contenu**.</li><li>Au plus 1 e-mail par fil toutes les 15 min.</li><li>Aucun e-mail si désactivé dans le profil.</li></ul> | `staff-messaging.test.ts`, `admin.spec.ts` | ✅ |
| [B11](https://github.com/SmartegyCanada/lex-portal/issues/36) | En tant que **Client**, je veux utiliser le portail sur mon téléphone. | <ul><li>Menu en tiroir.</li><li>Aucun défilement horizontal.</li><li>Zones tactiles de 24 px ou plus.</li></ul> | `portal.spec.ts` (mobile), axe | ✅ |

## C. Espace cabinet

| # | Story | Critères d'acceptation | Test | Statut |
|---|---|---|---|---|
| [C1](https://github.com/SmartegyCanada/lex-portal/issues/37) | En tant qu'**Admin**, je veux suivre les invitations, les renvoyer ou les révoquer. | <ul><li>Statuts : en attente, acceptée, révoquée, expirée.</li><li>Un renvoi crée un **nouveau** lien (l'ancien cesse de fonctionner).</li></ul> | `admin.spec.ts` | ✅ |
| [C2](https://github.com/SmartegyCanada/lex-portal/issues/38) | En tant qu'**Admin**, je veux donner ou retirer l'accès d'un client à un dossier. | <ul><li>Octroi en lecture seule ou en lecture et réponse.</li><li>La **révocation est immédiate**, même si le client a une session ouverte.</li><li>Un motif est obligatoire.</li><li>Tout est journalisé.</li></ul> | `admin.spec.ts`, `portal.spec.ts` | ✅ |
| [C3](https://github.com/SmartegyCanada/lex-portal/issues/39) | En tant qu'**Admin**, je veux suspendre un compte client. | Toutes ses sessions sont coupées et plus aucun dossier n'est lisible. | `admin.spec.ts` (écran) | ✅ |
| [C4](https://github.com/SmartegyCanada/lex-portal/issues/40) | En tant qu'**Admin**, je veux consulter le journal d'audit. | <ul><li>Les actions sensibles, de la plus récente à la plus ancienne, avec pagination.</li><li>Le journal ne peut pas être modifié.</li></ul> | `06_audit.test.sql`, `admin.spec.ts` | ✅ ⏳ export CSV |
| [C5](https://github.com/SmartegyCanada/lex-portal/issues/41) | En tant qu'**Admin**, je veux créer d'avance les comptes du personnel. | <ul><li>Domaine du cabinet uniquement.</li><li>Le compte devient utilisable à la première connexion Microsoft.</li></ul> | `auth.test.ts` | ✅ |
| [C7](https://github.com/SmartegyCanada/lex-portal/issues/47) | En tant que **Personnel**, je veux lire et répondre aux messages des clients de mes dossiers, ouvrir un fil et le clore. | <ul><li>Page Messages : fils de mon équipe, non-lus signalés.</li><li>Réponse et nouveau fil (tous les clients du dossier inclus).</li><li>« Clore le fil ».</li><li>Fil hors de mon équipe : « Page introuvable ».</li></ul> | `14_messagerie_cabinet.test.sql`, `staff-messaging.test.ts`, `admin.spec.ts` | ✅ |
| [C6](https://github.com/SmartegyCanada/lex-portal/issues/42) | En tant que **Personnel**, je veux voir les dossiers de mon équipe, sans les écrans d'administration. | Les pages Clients, Invitations et Audit donnent « page introuvable » au personnel. | `admin.spec.ts` (rôles) | ✅ |

## D. Intégrations (phases suivantes)

| # | Story | Statut |
|---|---|---|
| [D1](https://github.com/SmartegyCanada/lex-portal/issues/43) | En tant qu'**Admin**, je veux connecter Clio, puis importer les dossiers et factures d'un client, en lecture. <ul><li>OAuth PKCE.</li><li>Jetons chiffrés dans Vault.</li><li>Brouillons jamais importés.</li><li>L'import ne donne aucun accès.</li><li>Synchronisation toutes les 30 min.</li></ul> | ✅ sur le faux Clio (`clio-sync.test.ts`, `admin.spec.ts`) ; 🟡 vrai Clio dès que vos identifiants sont saisis. Rendez-vous Clio : ⏳ |
| [D2](https://github.com/SmartegyCanada/lex-portal/issues/44) | En tant que **Client**, je veux voir les vrais documents de SharePoint et y déposer les miens (avec antivirus). | ⏳ Phase 3 |
| [D3](https://github.com/SmartegyCanada/lex-portal/issues/45) | En tant que **Client**, je veux signer avec DocuSign et payer en ligne. | ⏳ Phase 4 |

## E. Bureaux et calendrier de cour (plan `docs/plan-bureaux-calendrier.md`)

| # | Story | Lot | Statut |
|---|---|---|---|
| [E1](https://github.com/SmartegyCanada/lex-portal/issues/70) | En tant qu'Admin, je veux créer et gérer les bureaux du cabinet. | 1 | 🟡 lot 1 |
| [E2](https://github.com/SmartegyCanada/lex-portal/issues/71) | En tant qu'Admin, je veux gérer la liste des tribunaux. | 1 | 🟡 lot 1 |
| [E3](https://github.com/SmartegyCanada/lex-portal/issues/72) | En tant qu'Admin, je veux rattacher chaque avocat à un bureau principal, et éventuellement à d'autres. | 1 | 🟡 lot 1 |
| [E4](https://github.com/SmartegyCanada/lex-portal/issues/73) | En tant que Personnel, je veux qu'un dossier soit rattaché à un bureau, et pouvoir filtrer par bureau. | 1 | 🟡 lot 1 |
| [E5](https://github.com/SmartegyCanada/lex-portal/issues/74) | En tant que Personnel, je veux inscrire une date de cour dans un dossier. | 2 | 🟡 lot 2 |
| [E6](https://github.com/SmartegyCanada/lex-portal/issues/75) | En tant qu'Avocat, je veux confirmer chaque date de cour. | 2 | 🟡 lot 2 |
| [E7](https://github.com/SmartegyCanada/lex-portal/issues/76) | En tant que Personnel, je veux remettre ou annuler une date de cour sans perdre l'historique. | 2 | 🟡 lot 2 |
| [E8](https://github.com/SmartegyCanada/lex-portal/issues/77) | En tant que Personnel, je veux voir dans un dossier les dates de cour déjà saisies dans Clio. | 2 | ⏳ |
| [E9](https://github.com/SmartegyCanada/lex-portal/issues/78) | En tant qu'Admin, je veux une vue générale du calendrier de cour de tout le cabinet. | 3 | 🟡 lot 3 |
| [E10](https://github.com/SmartegyCanada/lex-portal/issues/79) | En tant que Personnel, je veux le calendrier de cour de mon bureau et le mien. | 3 | 🟡 lot 3 |
| [E11](https://github.com/SmartegyCanada/lex-portal/issues/80) | En tant qu'Avocat, je veux être averti d'un conflit d'horaire. | 3 | 🟡 lot 3 |
| [E12](https://github.com/SmartegyCanada/lex-portal/issues/81) | En tant que Personnel, je veux des rappels avant chaque date de cour. | 3 | 🟡 lot 3 + lot 4 (accueil, rappels Outlook J-7 et J-1) |
| [E13](https://github.com/SmartegyCanada/lex-portal/issues/82) | En tant que Personnel sur téléphone, je veux un calendrier lisible. | 3 | 🟡 lot 3 |
| [E14](https://github.com/SmartegyCanada/lex-portal/issues/83) | En tant que Personnel, je veux connecter mon agenda Outlook. | 4 | 🟡 lot 4 (simulateur ; vrai Outlook après l'accès Microsoft) |
| [E15](https://github.com/SmartegyCanada/lex-portal/issues/84) | En tant que Personnel, je veux déconnecter mon agenda, et en tant qu'Admin couper la connexion d'une personne. | 4 | 🟡 lot 4 |
| [E16](https://github.com/SmartegyCanada/lex-portal/issues/85) | En tant que Personnel, je veux que les dates de cour de Clio arrivent seules dans la plateforme. | 4 | 🟡 partiel (dates créées par la plateforme ; import des autres : décision du cabinet) |
| [E17](https://github.com/SmartegyCanada/lex-portal/issues/86) | En tant que Client, je veux voir mes prochaines dates de cour et les consignes de mon avocat. | 5 | 🟡 lot 5 |
| [E18](https://github.com/SmartegyCanada/lex-portal/issues/87) | En tant qu'Admin, je veux voir la charge d'audiences par avocat, par bureau et par tribunal. | 6 | 🟡 lot 6 |

## F. Contrats et rédaction (plan `docs/plan-contrats.md`)

| ID | Story | Lot | Statut |
|---|---|---|---|
| [F1](https://github.com/SmartegyCanada/lex-portal/issues/97) | En tant que membre du personnel, je veux une section « Contrats » qui liste tous mes contrats. | 1 | 🟡 lot 1 |
| [F2](https://github.com/SmartegyCanada/lex-portal/issues/98) | En tant que membre du personnel, je veux créer un contrat pour un client existant ou nouveau. | 1 | 🟡 lot 1 |
| [F3](https://github.com/SmartegyCanada/lex-portal/issues/99) | En tant que membre du personnel, je veux rédiger et modifier le contrat dans la plateforme. | 1 | 🟡 lot 1 (aperçu imprimable ; PDF figé au lot 3) |
| [F4](https://github.com/SmartegyCanada/lex-portal/issues/100) | En tant qu'Admin, je veux créer et maintenir des modèles de contrats. | 2 | 🟡 |
| [F5](https://github.com/SmartegyCanada/lex-portal/issues/101) | En tant qu'Admin, je veux une bibliothèque de clauses bilingues. | 2 | 🟡 |
| [F6](https://github.com/SmartegyCanada/lex-portal/issues/102) | En tant qu'Admin, je veux un catalogue de services et d'honoraires avec les taxes par province. | 2 | 🟡 |
| [F7](https://github.com/SmartegyCanada/lex-portal/issues/103) | En tant qu'avocat, je veux valider un contrat. | 3 | 🟡 |
| [F8](https://github.com/SmartegyCanada/lex-portal/issues/104) | En tant qu'avocat, je veux envoyer un contrat au client et suivre son statut. | 3 | 🟡 |
| [F9](https://github.com/SmartegyCanada/lex-portal/issues/105) | En tant que client, je veux voir les contrats que le cabinet m'a envoyés. | 3 | 🟡 |
| [F10](https://github.com/SmartegyCanada/lex-portal/issues/106) | En tant qu'avocat, je veux ouvrir le dossier et inviter le client à partir d'un contrat signé. | 3 | 🟡 |
| [F11](https://github.com/SmartegyCanada/lex-portal/issues/107) | En tant qu'avocat, je veux que le contrat validé soit rangé dans Clio et SharePoint. | 4 | ⏳ |
| [F12](https://github.com/SmartegyCanada/lex-portal/issues/108) | En tant qu'avocat, je veux que l'IA m'aide à rédiger une section. | 5 | 🟡 |
| [F13](https://github.com/SmartegyCanada/lex-portal/issues/109) | En tant qu'avocat, je veux que l'IA crée un gabarit de contrat à partir d'une description. | 5 | 🟡 |
| [F14](https://github.com/SmartegyCanada/lex-portal/issues/110) | En tant qu'Admin, je veux encadrer l'IA (données masquées, plafond de coût). | 5 | 🟡 |
