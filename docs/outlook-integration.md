# Connexion des agendas Outlook — guide pour l'administrateur Microsoft 365 du cabinet

> **Pour qui** : l'administrateur Microsoft 365 de Lex Canada Law (domaine `lexcanadalaw.com`).
> **Durée** : environ 20 minutes.
> **Pourquoi** : pour que chaque avocat ou adjoint·e puisse connecter son agenda Outlook au portail. Le calendrier de cour tient alors compte de ses rendez-vous (conflits d'horaire), et des rappels de préparation peuvent être ajoutés à son agenda (ADR 0031).
> Tant que ces étapes ne sont pas faites, le portail fonctionne avec un **simulateur** : agenda fictif, avec le badge « Données de démonstration ».

## 1. Ce que le portail fera, et ne fera pas

| Le portail… | Détail |
|---|---|
| **lit les plages occupées** | Début et fin seulement, sur les 60 prochains jours. Jamais le titre, le lieu, les participants, le contenu ni les pièces jointes. |
| **écrit des rappels, si la personne le veut** | Dans un agenda séparé « Lex Portail » : « Préparation J-7 — Audience — LC-2026-0142 ». Le rappel ne contient jamais le nom du client et apparaît comme « disponible ». |
| **ne recopie pas les dates de cour** | Clio les envoie déjà dans Outlook : il n'y a donc pas de doublon. |
| **ne lit jamais les courriels** | Aucune permission sur la boîte de courriel n'est demandée. |
| **agit au nom de la personne seulement** | Permissions **déléguées** : chaque personne donne son accord pour son propre agenda. Aucun accès à l'agenda des autres. |

## 2. Enregistrer l'application (centre d'administration Microsoft Entra)

1. Ouvrir **https://entra.microsoft.com** avec un compte administrateur général, ou administrateur d'applications.
2. **Identité → Applications → Inscriptions d'applications → Nouvelle inscription**, puis :
   - **Nom** : `Lex Portail — Agendas` ;
   - **Types de comptes pris en charge** : *Comptes dans cet annuaire d'organisation uniquement (locataire unique)* ;
   - **URI de redirection** : type **Web**, avec la valeur suivante :
     - serveur de test : `https://lexlaw.2-24-110-184.sslip.io/api/integrations/outlook/callback` ;
     - production : l'adresse définitive du portail suivie de `/api/integrations/outlook/callback`, à ajouter quand le domaine sera fixé.
3. Cliquer sur **Inscrire**, puis noter :
   - **ID d'application (client)** ;
   - **ID de l'annuaire (locataire)**.

## 3. Permissions (Microsoft Graph, déléguées)

**Autorisations d'API → Ajouter une autorisation → Microsoft Graph → Autorisations déléguées** :

| Permission | Pourquoi |
|---|---|
| `User.Read` | Reconnaître la personne qui se connecte. |
| `offline_access` | Garder la connexion sans redemander le mot de passe. Le jeton est chiffré dans le coffre du portail. |
| `Calendars.ReadBasic` | Lire les **plages occupées** (heures de début et de fin). |
| `Calendars.ReadWrite` | **Seulement pour les rappels** : créer l'agenda « Lex Portail » et ses rappels. Le portail ne la demande qu'à une personne qui active les rappels. |

Ensuite, cliquer sur **Accorder un consentement d'administrateur pour Lex Canada Law**. Les personnes n'auront pas à approuver une fenêtre Microsoft supplémentaire.

## 4. Limiter l'application au personnel (recommandé)

**Applications d'entreprise → Lex Portail — Agendas → Propriétés** :
1. **Affectation requise** : **Oui**.
2. **Utilisateurs et groupes** : ajouter le groupe des avocats et adjoint·e·s.

Seules ces personnes pourront connecter leur agenda.

## 5. Secret de l'application

1. **Certificats et secrets → Nouveau secret client**.
   - Description : `Portail`.
   - Expiration : **12 mois**. Prévoir un rappel pour le renouveler.
2. Copier la **valeur** tout de suite : elle ne sera plus affichée.

⚠️ **Ne jamais envoyer le secret par courriel, Teams ou clavardage.** Le transmettre au responsable technique par un canal sécurisé : un gestionnaire de mots de passe partagé, ou un lien à usage unique. Il sera placé dans la configuration du serveur, jamais dans le code.

## 6. À transmettre au responsable technique

| Information | Exemple | Canal |
|---|---|---|
| ID du locataire | `xxxxxxxx-xxxx-…` | Courriel |
| ID d'application (client) | `xxxxxxxx-xxxx-…` | Courriel |
| Secret client | — | **Canal sécurisé seulement** |
| Date d'expiration du secret | 2027-10-… | Courriel |
| Groupe autorisé (section 4) | « Avocats et adjoints » | Courriel |

## 7. Départ d'un employé

- **Désactiver le compte dans le portail** (espace cabinet) : son agenda est déconnecté automatiquement, le jeton est supprimé du coffre, et l'action est journalisée.
- **Désactiver le compte Microsoft 365** : Microsoft révoque aussi la connexion. Le portail affiche alors « À reconnecter » et ne lit plus rien.
- Les rappels déjà écrits dans l'agenda « Lex Portail » restent dans la boîte de la personne : la plateforme n'a plus de jeton pour les retirer. Ils ne contiennent que la sorte de date et le numéro du dossier. Ils suivent le sort de la boîte, et l'administrateur peut supprimer cet agenda au départ de la personne. Une déconnexion faite **par la personne ou par le firm_admin** retire d'abord les rappels.

## 8. Ce qui reste à faire côté portail, après ces étapes (responsable technique)

- Le client Microsoft Graph (`server/providers/outlook/client.ts`) et la route de connexion OAuth (PKCE, `state`), sur le modèle de Clio.
- `INTEGRATION_MODE_OUTLOOK=live`, avec les variables `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID` et `OUTLOOK_CLIENT_SECRET` (noms à ajouter à `.env.example`, sans valeurs).
- Les points d'accès Graph envisagés sont listés ci-dessous. Ils sont **à confirmer** sur le locataire avant l'implémentation (règle AGENTS.md §2.6) :

| Besoin | Point d'accès envisagé | Statut |
|---|---|---|
| Plages occupées | `POST /me/calendar/getSchedule` (ou `GET /me/calendarView` avec `$select=start,end,showAs`) | À confirmer |
| Agenda « Lex Portail » | `POST /me/calendars` | À confirmer |
| Rappels | `POST`, `PATCH` et `DELETE /me/calendars/{id}/events`, avec `showAs = free` | À confirmer |
