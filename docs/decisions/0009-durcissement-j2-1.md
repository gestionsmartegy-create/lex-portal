# ADR 0009 — Durcissement J2.1 (suite de la revue de sécurité indépendante)

**Statut :** Acceptée (correction demandée par le responsable le 2026-10-01, plan approuvé)
**Date :** 2026-10-01

## Contexte
Une revue de sécurité indépendante de J1 et J2, menée par un agent qui n'avait pas écrit le code et confirmée par des tentatives dans des transactions annulées, a relevé :
- **E1** : droits du personnel sans exigence de connexion Microsoft ni de MFA ;
- **E2** : messagerie générale, notifications et profil sans exigence de MFA client ni de compte actif ;
- **M1** : fuites de métadonnées vers le personnel hors équipe ;
- **M2** : redirection ouverte via `action_url` ;
- **M3** : changement d'e-mail sans confirmation, et première connexion Microsoft du personnel impossible avec les inscriptions désactivées ;
- **F1 à F6** : fuites mineures et chaîne d'approvisionnement ;
- des tests trop faibles (T26, T21, T32, T12).

La contre-épreuve de la CI a aussi montré que le build dépendait de Google Fonts.

## Décisions
Nouvelle migration `20261001130000_security_hardening.sql` (les migrations publiées ne sont jamais modifiées).

| # | Décision |
|---|---|
| E1 | `current_app_role()` ne renvoie un rôle que si la **session est valide**. Personnel : **uniquement** une session Microsoft (`amr` contient `oauth` **et** `azure` dans `app_metadata.provider` ou `providers`), ou un domaine marqué `allow_password`. ⚠️ Le chemin « `aal2` » initial a été **retiré** (migration `…140000`, après contre-revue) : « mot de passe oublié » + TOTP auto-enrôlé donnait les droits sans Microsoft. Le MFA du personnel est celui d'Entra ID. Contrainte : `allow_password` n'est possible que pour un domaine `*.test`. Ce dernier cas n'existe **qu'en local** (`lexcanadalaw.test`, ajouté par le seed) ; en production, `lexcanadalaw.com` n'autorise jamais le mot de passe. Un personnel désactivé perd tout droit immédiatement. |
| E2 | Client : compte actif **et** `aal2` pour tout, y compris fils généraux, notifications, préférences et modification du profil. Seule exception : la **lecture de son propre profil** avec un compte actif, nécessaire à l'écran d'enrôlement MFA. Nouveaux helpers : `session_ok()`, `account_active()`, `can_see_conversation()`. |
| M1 | Personnel : participants, organisations et profils clients uniquement pour les dossiers **actifs de son équipe** (`staff_shares_client`). |
| M2 | `action_url` : expression régulière stricte (chemin interne, jamais `//`, `/\` ni URL absolue). L'application revalidera aussi avant toute redirection (J3). |
| M3 | `enable_confirmations = true`. Un trigger sur `auth.users.email` synchronise `profiles.email` et **refuse** une adresse d'un domaine du personnel pour un compte client. |
| F1/F2 | Lecture **par colonne** : `revoke_reason`, `granted_by`, `revoked_by`, identifiants SharePoint et Clio, `storage_path` et `clio_state` ne sont plus lisibles par l'API utilisateur. Historique complet des accès : RPC `list_matter_access()` (firm_admin et équipe). Emplacement SharePoint d'un document : lu par le **serveur** avec `service_role`, **après** vérification de la visibilité avec la session de l'utilisateur (Phase 3). Ce choix remplace la RPC `document_location` envisagée au plan, qui aurait exposé ces identifiants à un appel direct depuis le navigateur. |
| F3 | `granted_by` et `revoked_by` sont forcés à `auth.uid()` en session utilisateur ; le motif est figé hors révocation. |
| F4 | Le `matcher` de `proxy.ts` liste explicitement les ressources statiques, si bien que toute page reçoit sa CSP. CSP de repli `default-src 'none'` sur `/api/*`. |
| F5 | Personnel fictif sur `@lexcanadalaw.test`, jamais sur le vrai domaine du cabinet. |
| F6 | Actions GitHub épinglées par **SHA** ; Dependabot avec un délai de prudence de 7 jours ; `shadcn` déplacé en `devDependencies`. |
| Polices | `next/font/local` (fichiers woff2 et licences OFL dans `app/fonts/`) : aucun appel à Google au build ni à l'exécution. |

## Conséquences
- **Code applicatif (J3+)** : toujours **sélectionner des colonnes explicites** (`select("id, title, …")`), jamais `*`, sur `matters`, `documents`, `invoices` et `matter_access`. Sinon la requête échoue (privilège de colonne).
- **Question ouverte pour J3, à trancher dans son plan : première connexion Microsoft du personnel.** Avec `enable_signup = false`, Supabase refuse aussi la création de compte par OAuth. Proposition : le firm_admin **pré-crée** le compte du personnel (API admin, e-mail du domaine), puis la première connexion Microsoft s'y rattache par l'e-mail vérifié.
- **Désactivation dans Microsoft** : la désactivation d'un compte dans Entra ID n'est pas encore répercutée dans `profiles.status`. Synchronisation à prévoir (Graph ou procédure de départ) ; en attendant, procédure manuelle.
- **Déploiement `standalone`** : copier `public/` et `.next/static/` à côté de `.next/standalone/` (comportement de Next.js), à intégrer au choix de l'hébergeur.
- Tests : **113** assertions pgTAP au total (`08_durcissement` : 49).
- **Contre-revue (2026-10-01)** : E2, M1-M3, F1, F3-F6 confirmés corrigés ; E1 complété par la migration `20261001140000_staff_oauth_only.sql` (OAuth Microsoft seulement, garde-fou `*.test`) ; F2 complété (identifiants de paiement, signature, rendez-vous, organisation et compte externe masqués).
- **À intégrer au plan J3** : revalider après décodage tout paramètre de redirection (`?next=%2F%2F…` passe la contrainte SQL d'`action_url`, qui ne vérifie que le chemin) ; le serveur passe un compte `invited` à `active` **avant** l'écran d'enrôlement MFA ; vérifier PostgREST avec `return=representation` sur les tables à colonnes restreintes ; n'activer **aucun autre** fournisseur OAuth que Microsoft.
