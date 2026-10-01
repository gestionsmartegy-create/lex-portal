# Authentification — clients (Supabase Auth) et personnel (Microsoft Entra ID)

> Ce document manquait dans les livrables de la Phase 0 (il était cité par `security.md`). Il est recréé le 2026-10-01 à partir de `security.md`, `architecture-alignment.md` et de la configuration Azure déjà existante (`technical-access-requirements.md`).

## 1. Deux systèmes d'identité, volontairement

| | Clients | Personnel (avocats, adjoints, administrateurs) |
|---|---|---|
| Fournisseur | Supabase Auth (e-mail + mot de passe) | Microsoft Entra ID via le fournisseur **Azure** de Supabase Auth |
| MFA | TOTP Supabase, **obligatoire** (vérifié en base : `aal2`) | Imposé par Microsoft (accès conditionnel du tenant) |
| Création du compte | **Uniquement sur invitation** (inscriptions publiques désactivées) | Automatique à la 1re connexion Microsoft, si le domaine est autorisé |
| Rôle | `client` | `staff` ; `firm_admin` attribué manuellement |
| Page | `/[locale]/login` | `/[locale]/staff/login` |

## 2. Configuration Entra ID (existante : à vérifier, puis renouveler le secret)

1. App Registration **« Lex Canada Portal — Staff Auth »**, tenant `LEXCANADALAW.COM`, **single-tenant** (`My organization only`).
2. Redirect URI : `https://<projet>.supabase.co/auth/v1/callback` (Supabase reçoit le retour OAuth, pas l'application).
3. Permissions déléguées minimales : `openid`, `email`, `profile`, `offline_access`. Ni `User.Read.All` ni aucune autre permission large.
4. Côté Supabase (Auth → Providers → Azure) : Client ID, secret, et **Azure Tenant URL = `https://login.microsoftonline.com/<tenant-id>`**. L'URL du tenant, et non `common`, refuse les comptes personnels et ceux d'autres organisations (scénario 8).
5. **Le secret client a pu être connu de l'ancienne équipe : il faut le renouveler** dans Azure puis le reporter dans Supabase. Noter la date d'expiration du nouveau secret et prévoir un rappel.
6. Optionnel, recommandé : dans Entra, « Assignment required = Yes » sur l'application d'entreprise, pour que seuls les utilisateurs ou groupes assignés puissent se connecter.

## 3. Défense en profondeur côté base

`private.handle_new_user()` (trigger sur `auth.users`) :
- `provider = azure` **et** domaine présent dans `private.staff_email_domains` → `staff` / `active` ;
- `provider = azure` mais domaine non autorisé → `client` / `suspended`, sans aucun accès (scénario 9) ;
- toute autre inscription → `client` / `invited` (activation par invitation uniquement).

`private.guard_profile()` refuse tout rôle personnel pour un e-mail hors domaine, même attribué par le serveur. Il refuse aussi toute modification du rôle, du statut ou de l'e-mail par un utilisateur connecté.

## 4. Parcours client

1. **Invitation** (firm_admin) : formulaire e-mail + contact Clio + dossiers + niveau d'accès. Le serveur génère un jeton aléatoire de 32 octets, en stocke le **SHA-256** dans `client_invitations.token_hash` et envoie le lien `/[locale]/invite/<jeton>` (72 h, usage unique).
2. **Activation** : le serveur vérifie le hachage, l'expiration et le statut `pending` ; crée l'utilisateur Supabase (`auth.admin.createUser`, e-mail confirmé) ; demande le mot de passe (12 caractères minimum, vérification contre les mots de passe compromis si l'option Supabase est disponible) ; passe le profil en `active` ; crée les `matter_access` ; marque l'invitation `accepted`. Le tout dans une même transaction logique, journalisée.
3. **Enrôlement MFA** obligatoire avant tout accès au portail (QR code TOTP, puis vérification d'un code).
4. **Connexions suivantes** : mot de passe (`aal1`), puis code TOTP (`aal2`), puis portail. Sans `aal2`, la RLS renvoie zéro ligne et le middleware redirige vers `/login/mfa`.
5. **Mot de passe oublié** : message neutre, lien Supabase à usage unique, puis nouvelle vérification MFA.
6. **Déconnecter tous les appareils** : `signOut({ scope: 'global' })` révoque les jetons de rafraîchissement. Le jeton d'accès en cours expire seul (≤ 1 h), **mais la RLS a déjà coupé tout accès** si le compte est suspendu ou l'accès révoqué.

## 5. Sessions et cookies

- `@supabase/ssr` : cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Le jeton n'est jamais lisible en JavaScript, jamais dans `localStorage`.
- Durée du jeton d'accès : 1 h (valeur par défaut, à réduire si le cabinet le souhaite). Rafraîchissement géré par le middleware.
- Expiration d'inactivité côté application : 30 min (à confirmer), avec un avertissement 2 min avant.
- Côté serveur, utiliser `supabase.auth.getUser()` (validation auprès de Supabase), **jamais** `getSession()` seul, pour toute décision d'autorisation.

## 6. Points à confirmer

- Durée d'inactivité et durée maximale de session acceptées par le cabinet.
- Faut-il limiter l'espace `/admin` à un groupe Entra précis, via le claim `groups` (en plus de `matter_team` et `firm_admin`) ?
- Fournisseur d'envoi des e-mails transactionnels (SMTP personnalisé recommandé, par exemple Microsoft 365 ou un service hébergé au Canada) ; résidence des e-mails (voir `privacy-and-data-residency.md`).
