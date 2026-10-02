# ADR 0010 — Authentification (jalon J3)

**Statut :** Acceptée (plan J3 approuvé le 2026-10-01)
**Date :** 2026-10-01

## Décisions

| # | Sujet | Décision |
|---|---|---|
| 1 | Clients Supabase | `server/db/server-client.ts` : session de l'utilisateur (cookies HttpOnly, RLS), pour **toutes** les lectures de l'interface. `server/db/service-client.ts` : `service_role`, usages commentés (acceptation d'invitation, pré-création du personnel, RPC de limitation de débit et d'audit). |
| 2 | Source de vérité des gardes | RPC `public.current_session_role()` : le **rôle effectif tel que la RLS le voit** (null si client sans `aal2`, personnel sans session Microsoft, compte inactif). `requireClientSession()` et `requireStaff()` s'y appuient : le serveur ne peut pas diverger de la base. Un rôle insuffisant renvoie la même 404 qu'une page inexistante. |
| 3 | `proxy.ts` | Rafraîchit la session (`@supabase/ssr`) avec le nonce CSP et next-intl ; redirection rapide de `/portal` et `/admin` sans utilisateur ; `Cache-Control: no-store` sur les pages authentifiées. Le contrôle définitif reste dans les layouts et la RLS. |
| 4 | MFA client | TOTP **obligatoire** : enrôlement au premier passage (QR + clé), puis vérification à chaque connexion. Les facteurs non vérifiés sont nettoyés avant un nouvel enrôlement. Changer de mot de passe exige `aal2` si un facteur existe. |
| 5 | Invitations | Jeton aléatoire de 32 octets, **SHA-256** en base, 72 h. Réservation **atomique** (`pending → accepted`), création du compte, profil **actif avant MFA**, accès aux dossiers (`granted_by` = l'auteur de l'invitation), avec **compensation** en cas d'échec (compte supprimé, invitation rouverte). E-mail sans aucune donnée de dossier. |
| 6 | Personnel | **Pré-création** par le firm_admin (`/admin/staff`, API admin, sans mot de passe). La première connexion Microsoft s'y rattache par l'e-mail vérifié (**à confirmer avec le vrai tenant**). Bouton Microsoft désactivé tant que `NEXT_PUBLIC_STAFF_SSO_ENABLED` n'est pas `true`. Formulaire de démonstration **en développement uniquement**, comptes `*.test` uniquement. La page client refuse les adresses du personnel. |
| 7 | Redirections | `lib/safe-redirect.ts` : décodage complet (jusqu'à 3 niveaux), refus de `//`, `/\`, schémas, caractères de contrôle et `..`, d'un paramètre contenant une URL, et de tout ce qui n'est pas sous `/en` ou `/fr`. 26 cas testés. |
| 8 | Limitation de débit | RPC `public.rate_limit_hit` (`service_role` uniquement), **échec fermé** : une erreur technique refuse l'action. Clés sans e-mail en clair (empreinte). |
| 9 | Audit | Relais `public.record_audit_event` (`service_role` uniquement) : connexions, échecs, MFA, déconnexions, réinitialisations, invitations, personnel. Jamais d'e-mail, de mot de passe ni de jeton dans les métadonnées. |
| 10 | E-mails | Interface `EmailSender` : `SmtpEmailSender` (en local, Mailpit sur le port 54325 ; aucun e-mail réel) et `MockEmailSender`. Fournisseur de production **à décider** (open-questions). |
| 11 | Environnement local | `pnpm env:local` écrit `.env.local` depuis `supabase status` sans afficher les valeurs, et refuse tout hôte non local. Studio, Realtime et Storage sont **désactivés** en local (Mac de 8 Go saturé : machine virtuelle OrbStack tuée par manque de mémoire, constaté le 2026-10-01). On les réactive quand une phase en a besoin. |
| 12 | Tests | **Intégration** (`pnpm test:integration`, Supabase local réel, ajoutés à la CI) : invitation, jeton à usage unique ou expiré, `aal1` → 0 dossier, TOTP réel → `aal2` → dossier visible, déconnexion globale, personnel par mot de passe → aucun droit, `*.test` → droits, `return=representation`, `select *` refusé, RPC serveur fermées. **Unitaires** : redirections, jetons, Zod. **pgTAP** : 137. |

## Conséquences
- **Le responsable doit**, pour activer Microsoft : configurer Azure (`docs/auth-entra-id-integration.md` §2), renseigner `SUPABASE_AUTH_EXTERNAL_AZURE_*`, activer `[auth.external.azure]`, passer `NEXT_PUBLIC_STAFF_SSO_ENABLED=true`, puis vérifier le **rattachement** d'un compte pré-créé lors de la première connexion.
- La bibliothèque Supabase affiche un avertissement « getSession() » lors des appels MFA côté serveur. Toutes nos décisions d'autorisation passent pourtant par `getUser()` et `current_session_role()` (vérifié).
- Interfaces complètes du portail et de l'admin : J5. Tests e2e navigateur : J6.

## Addendum — revue de sécurité indépendante J3 (2026-10-01)

| Constat | Correction |
|---|---|
| E1 · cookies de session lisibles par JavaScript | `server/db/cookie-options.ts` : `HttpOnly`, `Secure` en production, `SameSite=Lax`, appliqué au client serveur et à `proxy.ts`. |
| M3 · invitation client vers une adresse du cabinet | Refus par Zod (création) et révocation à l'acceptation. **Garde en base** (migration 160000) : un compte non-Microsoft sur un domaine du personnel est refusé, sauf pré-création autorisée par `public.authorize_staff_provisioning` (`service_role` uniquement, usage unique, valable 1 h). On utilise une table d'autorisation, car GoTrue insère le compte **avant** d'y poser `app_metadata`. |
| F1 · liens « localhost » en production | `APP_BASE_URL` est obligatoire en production (`server/env.ts`). |
| F2 · audit incomplet | Échecs de connexion audités avec l'empreinte du compte, connexions par rappel OAuth audités, méthode `totp`. |
| F3 · blocage d'un compte par un tiers | `rate_limit_check` (lecture sans incrément) : seuls les **échecs** sont comptés par compte. |
| F4 · compensation incomplète | Si le compte ne peut pas être supprimé ou l'invitation rouverte, l'invitation est **révoquée**. |
| M2 · IP falsifiable | `parseClientIp` lit `x-forwarded-for` **par la droite**, selon `TRUSTED_PROXY_HOPS`. L'identifiant de requête est généré par le serveur. |

**Prérequis avant la mise en production** (non traités en J3) :
- **M1** : Auth Hooks Supabase (« MFA verification attempt » et « password verification attempt ») pour limiter les tentatives côté GoTrue. Notre limitation applicative ne couvre pas les appels directs à l'API Auth.
- **M2** : fixer `TRUSTED_PROXY_HOPS` selon l'hébergeur retenu (open-questions).
