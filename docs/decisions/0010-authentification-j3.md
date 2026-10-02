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
| 12 | Tests | **Intégration** (`pnpm test:integration`, Supabase local réel, ajoutés à la CI) : invitation, jeton à usage unique ou expiré, `aal1` → 0 dossier, TOTP réel → `aal2` → dossier visible, déconnexion globale, personnel par mot de passe → aucun droit, `*.test` → droits, `return=representation`, `select *` refusé, RPC serveur fermées. **Unitaires** : redirections, jetons, Zod. **pgTAP** : 127. |

## Conséquences
- **Le responsable doit**, pour activer Microsoft : configurer Azure (`docs/auth-entra-id-integration.md` §2), renseigner `SUPABASE_AUTH_EXTERNAL_AZURE_*`, activer `[auth.external.azure]`, passer `NEXT_PUBLIC_STAFF_SSO_ENABLED=true`, puis vérifier le **rattachement** d'un compte pré-créé lors de la première connexion.
- La bibliothèque Supabase affiche un avertissement « getSession() » lors des appels MFA côté serveur. Toutes nos décisions d'autorisation passent pourtant par `getUser()` et `current_session_role()` (vérifié).
- Interfaces complètes du portail et de l'admin : J5. Tests e2e navigateur : J6.
