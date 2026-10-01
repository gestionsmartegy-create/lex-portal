# Portail Client Lex Canada — Exigences produit (Phase 0)

## 1. Objectif

Portail client sécurisé, bilingue (FR/EN), permettant à un client de Lex Canada Law de consulter — dans une seule application — l'état de ses dossiers, ses documents, ses échéances, ses factures, ses demandes de signature et sa messagerie avec le cabinet, sans dupliquer le back-office de Clio Manage.

## 2. Rôles

| Rôle | Périmètre | Source d'authentification |
|---|---|---|
| Client | Dossiers explicitement associés via `matter_access` | Supabase Auth (email + MFA) |
| Administrateur du cabinet | Gestion des accès, association Supabase↔Clio, supervision des synchronisations | Supabase Auth, rôle élevé |
| Avocat / personnel | Continue de travailler dans Clio Manage / M365 ; pas de duplication du back-office | Hypothèse d'architecture — future fédération avec Microsoft Entra ID (à valider) |

## 3. Fonctionnalités — vue d'ensemble

| Domaine | Fonctionnalité | Statut de faisabilité (résumé, détail dans clio-api-mapping.md) |
|---|---|---|
| Auth | Connexion, invitation, MFA, sessions | Confirmé par la documentation (Supabase Auth) |
| Dossiers | Liste, détail, statut, chronologie | Partiellement disponible — Clio Manage expose `matters`, mais « statut » et « chronologie orientée client » ne sont pas des champs natifs ; nécessite modélisation applicative |
| Documents | Liste, partage, dépôt, téléversement | Partiellement disponible — API Documents existe (Clio) ; SharePoint alternatif à confirmer avec le cabinet (l'architecture verrouillée mentionne SharePoint comme dépôt documentaire officiel) |
| Messagerie | Conversations par dossier | À valider avec Clio — Clio for Clients (portail natif) gère la messagerie, mais son exposition en écriture par API n'est pas confirmée dans la documentation consultée |
| Calendrier | Rendez-vous, échéances | Confirmé par la documentation — ressource Calendar Entries / Activities de Clio Manage |
| Facturation | Factures, soldes, historique | Confirmé par la documentation — ressource Bills de Clio Manage |
| Paiement | Paiement en ligne | Confirmé par la documentation — Clio Payments est disponible pour les comptes canadiens ; l'intégration API précise au portail reste à valider |
| Signature | Documents à signer | Non disponible dans Clio (pas de produit de signature natif confirmé) — DocuSign proposé comme hypothèse d'architecture |
| Notifications | In-app, e-mail, SMS (préparé, non activé) | Hypothèse d'architecture — propre au portail (Supabase) |
| Administration | Association utilisateur↔contact↔dossier, révocation | Hypothèse d'architecture — propre au portail |

## 4. Contraintes transversales

- Séparation stricte des données entre clients (RLS Supabase + contrôle serveur).
- Bilinguisme FR/EN sur toutes les pages.
- Aucune donnée sensible affichée avant validation complète des droits.
- Aucun secret ni jeton exposé au navigateur.
- Traçabilité : journal d'audit applicatif pour tout accès et toute action sensible.

## 5. Ce que ce document ne couvre pas

- Le détail des endpoints (voir `clio-api-mapping.md`).
- Le modèle de données (voir `data-model.md`).
- Le choix d'architecture (voir `architecture-evaluation.md` et `architecture-decision-matrix.md`).

## Sources et niveau de confirmation

| Source | Utilisée pour | Statut |
|---|---|---|
| ARCHITECTURE VERROUILLÉE.pdf | Structure du site vitrine Lex Canada (organigramme fonctionnel, pas le portail client) | Confirmé — document fourni |
| BLUEPRINTLEX_CANADA_ARCHITECTURE.pdf (schéma directeur) | Cartographie des 6 pôles (Law, Business/Financial, Advisory, Insights, Tools, Connect) | Confirmé — document fourni |
| VECTORIELPLATEFORME_INFORMATIQUE.pdf (mémorandum EA) | Architecture cible Microsoft 365 / Clio / SharePoint / Power Platform, verticales logicielles par domaine de droit | Confirmé — document fourni, présenté comme recommandation à visée du partenaire informatique, non encore un standard adopté |
| Maquette https://lexcanada-jdkordhm.manus.space/ | Direction visuelle | **Non consulté en détail** — le site est une application monopage ; la récupération automatisée n'a renvoyé que les métadonnées (titre, image Open Graph), pas le contenu applicatif. À examiner manuellement dans un navigateur avant la Phase 1. |
| docs.developers.clio.com (Manage + Grow) | Capacités API réelles (régions, OAuth, rate limits, webhooks, ressources) | Confirmé par la documentation, voir citations dans les autres documents |
| clio.com/clients, help.clio.com | Fonctionnement de Clio for Clients (produit natif, pas une API ouverte de messagerie) | Confirmé par la documentation |
| Supabase docs (régions) | Disponibilité de la région Canada (ca-central-1) | Confirmé par la documentation |

**Point important non résolu :** la maquette fonctionnelle n'a pas pu être inspectée visuellement par un outil automatisé (SPA sans contenu texte accessible côté serveur). Elle devra être parcourue manuellement (capture d'écran ou navigation assistée) avant de figer le `page-map.md` définitif.
