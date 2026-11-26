# Identifiants et accès techniques nécessaires

> Aucun secret ne doit être transmis dans ce document, dans un autre document du projet, ou versionné dans Git. Cette liste sert uniquement à identifier **qui doit fournir quoi** et **où en est chaque accès**, jamais à recevoir les valeurs elles-mêmes (Client ID excepté, qui n'est pas un secret et sert de référence utile pour la traçabilité).

## Clio

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| Compte développeur Clio, région Canada | Cabinet / administrateur Clio | Créer l'application OAuth | ⚠️ En rotation — voir §Historique ci-dessous |
| Client ID / Client Secret | Généré via le portail développeur `ca.developers.clio.com` | Flux OAuth Authorization Code + PKCE | ⚠️ À régénérer avec le compte d'essai actuel (voir §Historique) |
| Redirect URI de test | Équipe de développement, validé par le cabinet | Enregistrement de l'application Clio | ✅ Fixée : `http://127.0.0.1:3000/api/auth/clio/callback` |
| Redirect URI de production | Équipe de développement, validé par le cabinet | Enregistrement de l'application Clio | ⬜ Pas encore définie — dépend du domaine de production (voir §Hébergement) |
| Confirmation des permissions (scopes) à activer | Administrateur Clio du cabinet | Portée de l'accès OAuth | ✅ Décidées : lecture seule sur Matters, Contacts, Calendars, Billing, Documents, Webhooks, Users |
| Compte développeur gratuit (post-essai) | Clio, sur demande (`api.partnerships@clio.com`) | Continuité d'accès au-delà des 7 jours d'essai | ⏳ Demande envoyée, en attente de réponse |

## Microsoft 365 / SharePoint

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| Tenant Microsoft 365 | Administrateur M365 du cabinet | Contexte Entra ID | ✅ Provisionné : `LEXCANADALAW.COM` |
| **Administrateur Microsoft 365 désigné** | Cabinet | Interlocuteur pour les App Registrations, `Sites.Selected`, le certificat, l'emplacement des données, la licence Defender | ✅ Compte **Admin@lexcanadalaw…** (communiqué le 2026-10-01). ⚠️ Orthographe à confirmer : le tenant est `lexcanadalaw.com`, mais le nom communiqué était « lexacanadalaw » |
| App Registration Azure (auth personnel) | Administrateur Azure du cabinet | Connexion staff/admin via Supabase Auth | ✅ Créée : `Lex Canada Portal — Staff Auth`, single-tenant |
| App Registration Azure « Lex Canada Portal — Documents (Graph) » | Administrateur Azure du cabinet | Appels Microsoft Graph app-only pour les documents, **certificat** plutôt que secret | ⬜ Pas encore créée — Phase 3, distincte de celle de l'auth |
| Site SharePoint « Dossiers clients » et bibliothèque | Cabinet | Dépôt officiel des fichiers clients (ADR 0004) | ⬜ Site à créer, ou structure existante à décrire (`sharepoint-integration.md` §2) |
| `Sites.Selected` + attribution du rôle `write` sur le seul site « Dossiers clients » | Administrateur M365 | Moindre privilège | ⬜ À faire en Phase 3 |
| Emplacement des données du tenant M365 (Canada ?) | Administrateur M365 | Résidence des données | ⬜ À vérifier |
| Licence Defender pour Office 365 (Safe Attachments for SharePoint) | Administrateur M365 | Option B antivirus | ⬜ À vérifier |

## Supabase

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| Projet Supabase | Équipe de développement, validé par le cabinet | Hébergement base de données et Auth | ✅ Créé : "lex law" — **région à reconfirmer** (jamais vérifiée explicitement comme `ca-central-1`) |
| Clés API (anon, service_role) | Généré à la création du projet | `service_role` réservé exclusivement au serveur | ✅ Obtenues — `service_role` régénérée une fois suite à une exposition accidentelle |
| Plan payant (Pro) | Décision du cabinet/de l'équipe projet | Éviter la mise en pause automatique du projet (constatée le 2026-08 avant la démo) | ⚠️ Recommandé avant toute démonstration ou mise en production — décision à confirmer |

## Hébergement

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| Compte d'hébergement (Azure App Service, cohérent avec la Solution 1 retenue) | Cabinet, après décision d'architecture | Déploiement Next.js | ⬜ Pas encore créé — développement actuellement en local uniquement |
| Domaines (production, préproduction) | Cabinet | Accès au portail | ⬜ Non définis |

## Signature électronique (si retenue)

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| ~~Environnement DocuSign~~ | — | Sans objet : signature dans Clio (option A, 2026-10-15 ; ADR 0045) | ✅ Aucun compte à créer |

## Paiement (si retenu au-delà du MVP)

| Élément | Fourni par | Utilisé pour | Statut |
|---|---|---|---|
| Compte de paiement (Clio Payments actif, Stripe, ou autre fournisseur canadien) | Cabinet, après arbitrage de `open-questions.md` | Intégration `PaymentProvider` | ⬜ Hors périmètre MVP pour l'instant |

---

## Historique — rotation du compte Clio Manage

Traçabilité des comptes Clio successifs, pour comprendre pourquoi plusieurs App ID apparaissent dans l'historique du projet (aucun secret ci-dessous, uniquement des identifiants publics et des dates).

| # | Date de création | App ID (Client ID non listé ici) | Statut | Raison du remplacement |
|---|---|---|---|---|
| 1 | Fin juillet 2026 | `349263` | ❌ Expiré (essai 7 jours dépassé, demande de compte développeur gratuit sans réponse à temps) | Essai expiré avant confirmation du compte développeur |
| 2 | Août 2026 | *(à compléter une fois l'App ID du nouveau compte noté)* | ⏳ Actif, en cours de configuration | Nouveau compte d'essai créé en attendant la réponse de Clio sur le compte développeur gratuit |

**Action en attente :** dès réception de l'approbation du compte développeur gratuit par Clio (demande envoyée pour le compte #2), documenter ici la conversion et arrêter la rotation de comptes.

**Rappel de procédure en cas de nouvelle rotation :** voir la checklist complète (renommer la firme, recréer l'app développeur, mettre à jour `.env.local`, recréer les données de test) — déjà exécutée deux fois, à ne pas refaire une troisième fois si possible avant la démonstration prévue.

## Sources et niveau de confirmation

Cette liste découle des exigences d'intégration confirmées dans `clio-api-mapping.md` et `sharepoint-integration.md`, mise à jour au fil de l'avancement réel du projet (Phase 1 terminée, Phase 2 en attente de l'accès Clio définitif).
