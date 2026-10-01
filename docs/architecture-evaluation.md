# Évaluation critique — Next.js + Supabase pour le portail client Lex Canada

Cette étude ne part pas du principe que Next.js + Supabase est le meilleur choix ; elle évalue sa pertinence réelle pour un portail juridique canadien intégré à Clio et Microsoft 365/SharePoint.

## 1. Avantages — dans quel contexte ils sont réels

| Avantage | Contexte où il est réel | Conditions à respecter | Limites |
|---|---|---|---|
| Rapidité de développement d'un MVP | Équipe déjà familière avec React/TypeScript | Discipline sur les Server Actions (pas de logique métier côté client) | La rapidité initiale se paie en dette si RLS mal conçu dès le départ |
| TypeScript frontend + backend | Réduit les erreurs de types entre couches | Mode strict activé partout, Zod pour valider toutes les entrées/sorties externes | Ne protège pas contre les erreurs de logique d'autorisation |
| PostgreSQL + RLS | Isolation fine des données par client, testable | Politiques RLS écrites et testées pour **chaque** table exposée | RLS mal configuré est le risque n°1 d'un portail multi-clients — voir §6 |
| Authentification intégrée + MFA | Réduit le travail de développement de l'auth | Vérifier la maturité des fonctionnalités entreprise (SSO futur avec Entra ID) | Fédération SSO avec Entra ID pour le personnel interne — **à valider**, non couvert par ce document |
| Résidence des données au Canada | Supabase propose la région `ca-central-1` (AWS Canada Central) | Choisir explicitement cette région à la création du projet | Les e-mails d'authentification et certains services annexes peuvent transiter par une autre infrastructure régionale — à valider avec Supabase |
| Prototypage rapide et évolutif | Vrai pour un MVP à données majoritairement en lecture | — | Les traitements longs et les webhooks à fort volume ne sont pas le point fort de l'architecture serverless par défaut |

## 2. Inconvénients et risques

| Risque | Niveau | Probabilité | Impact | Mesures de réduction | Acceptable pour le MVP ? |
|---|---|---|---|---|---|
| Mauvaise configuration RLS exposant les dossiers d'un autre client | Critique | Moyenne (si non testé) | Fuite de données juridiques confidentielles | Tests automatiques de non-régression RLS, revue de sécurité avant mise en production | Oui, **si** les tests RLS sont bloquants en CI |
| Exposition accidentelle du `service_role` Supabase | Critique | Faible si discipline respectée | Contournement total de la sécurité | `service_role` uniquement côté serveur, jamais en variable publique (`NEXT_PUBLIC_*`) | Oui, sous contrôle strict |
| Limites des fonctions serverless pour synchronisations volumineuses | Moyen | Élevée à mesure que le nombre de dossiers croît | Synchronisations incomplètes ou timeouts | Worker séparé dédié aux tâches longues (hors edge functions) | Oui pour le MVP à faible volume, à revoir en Phase 2 |
| Dépendance à Supabase (verrouillage fournisseur) | Moyen | Certaine à long terme | Coût de migration si changement de fournisseur | Le schéma reste du PostgreSQL standard, migration possible mais non triviale (Auth propriétaire) | Acceptable, à documenter en ADR |
| Multiplication des sources de données (Clio, SharePoint, Supabase) | Moyen | Élevée | Incohérences d'affichage, données périmées | Cache marqué avec `last_synced_at`, jamais présenté comme source de vérité | Oui, si l'UI indique la fraîcheur des données |
| Gestion des jetons OAuth Clio | Élevé | Moyenne | Compromission d'accès à des dossiers juridiques | Chiffrement au repos, rotation, coffre-fort de secrets dédié (pas seulement les variables d'environnement Vercel) | Nécessite décision du cabinet sur le coffre-fort retenu |
| Support entreprise et SLA | Moyen | — | Délai de résolution d'incident | Vérifier le plan Supabase (Pro/Team/Enterprise) et les DPA | À valider avec le cabinet / Supabase |
| Résidence réelle des sauvegardes et journaux | Moyen | — | Conformité LPRPDE / loi 25 (Québec) | Confirmer contractuellement avec Supabase la portée exacte de la résidence canadienne (DB vs journaux vs support) | **À valider avec un spécialiste de la protection des renseignements personnels** |

## 3. Comparaison avec d'autres architectures

Voir `architecture-decision-matrix.md` pour la matrice pondérée complète (Options A à D).

## 4. Modèles d'accès SharePoint — comparaison

| Modèle | Description | Avantages | Risques | Recommandation |
|---|---|---|---|---|
| 1 — Identité applicative | Le portail accède à SharePoint avec ses propres permissions d'application Graph (app-only) | Simplifie le contrôle centralisé, pas besoin de session utilisateur Microsoft | Le portail devient responsable à 100% de l'isolation des documents entre clients (aucune barrière native Microsoft) | Nécessite une couche d'autorisation applicative rigoureuse (mapping dossier ↔ dossier client vérifié à chaque appel) |
| 2 — Identité déléguée (au nom de l'utilisateur) | Le portail agit avec les permissions Microsoft de l'utilisateur connecté | Isolation portée en partie par les permissions SharePoint natives | Suppose que chaque client final ait une identité Microsoft (Entra External ID) — non prévu dans le cahier des charges actuel (les clients s'authentifient via Supabase) | Non applicable tel quel, sauf refonte de l'authentification client |

**Recommandation préliminaire (hypothèse d'architecture, à valider avec le cabinet et un architecte M365) :** Modèle 1 (identité applicative), avec permissions Graph limitées au site/bibliothèque documentaire de Lex Canada, et vérification applicative systématique de l'appartenance dossier→client avant toute émission de lien de téléchargement temporaire.

## Sources et niveau de confirmation

- Capacités Clio (rate limits, régions, OAuth, webhooks) : confirmées par la documentation officielle citée dans `clio-api-mapping.md`.
- Région Supabase Canada : confirmée par la documentation Supabase.
- Modèle SharePoint comme dépôt officiel : recommandation du mémorandum interne fourni, pas une décision actée par le cabinet.
- Risques RLS, jetons, dépendance fournisseur : analyse d'architecture (hypothèses), à valider par une revue de sécurité indépendante avant la mise en production.
