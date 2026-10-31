# Mise en ligne de la préproduction (lundi 5 octobre 2026)

> Pour le **responsable du projet**. Décisions : ADR 0013, 0040 et 0041 (nouveau Supabase au Canada, Vercel à Montréal).
> **Vous saisissez vous-même toutes les clés et tous les mots de passe**, directement dans Supabase, Vercel, Azure et Clio. Ne les envoyez jamais par chat ou par courriel, et ne les écrivez dans aucun fichier du dépôt.
> La préproduction ne reçoit **que des comptes de test et le personnel** : aucun vrai client avant la Phase 5.

Faites les étapes dans l'ordre. Chacune se termine par une **vérification**. Si une vérification échoue, arrêtez-vous et signalez-le.

---

## Étape 1 — Supabase : un nouveau projet (ADR 0041)

### 1.1 Créer le projet
L'ancien projet « lex law » de l'ancienne équipe n'est **pas** réutilisé (décision du 2026-10-29).
1. https://supabase.com/dashboard → **New project**, dans l'organisation du cabinet.
2. **Name** : `lex-portal`. **Region** : **Canada (Central) — ca-central-1**. Ce choix est définitif.
3. **Database password** : *Generate*, puis gardez-le dans votre gestionnaire de mots de passe.
4. Notez la **référence** du projet, visible dans l'adresse `…/project/<REF>` (elle n'est pas secrète).

**Vérification** : *Project Settings → General → Region* = `ca-central-1`.

### 1.2 Plan
*Organization → Billing* : plan **Pro** (sauvegardes quotidiennes, pas de mise en pause, protection contre les mots de passe divulgués).

### 1.3 Envoyer le schéma
Dans un terminal, à la racine du projet :
```bash
pnpm exec supabase login
```
```bash
pnpm exec supabase link --project-ref <REF_DU_PROJET>
```
```bash
pnpm exec supabase db push
```
- La référence du projet se lit dans l'URL du tableau de bord : `…/project/<REF>`.
- `link` et `db push` demandent le mot de passe de la base. **Tapez-le vous-même.**
- ⚠️ **Ne lancez pas** `supabase config push` : il enverrait les réglages de développement local (adresse localhost, pas de SMTP). Les réglages se font à la main, à l'étape 1.4.

**Vérification** :
- *Database → Migrations* : autant de migrations que de fichiers dans `supabase/migrations/` (la dernière porte la date la plus récente) ;
- *Table Editor* : les tables de `public` existent, toutes avec la RLS activée.

### 1.4 Réglages d'authentification (*Authentication*)

| Écran | Réglage |
|---|---|
| *Sign In / Providers → Email* | Activé. **Confirm email** : activé. **Secure password change** : activé. |
| *Sign In / Providers* (général) | **Allow new users to sign up** : **désactivé**. Anonyme : désactivé. Tous les autres fournisseurs : désactivés (sauf Azure, à l'étape 4). |
| *Policies / Passwords* | Longueur minimale **12** ; exigences : **minuscules, majuscules, chiffres, symboles**. **Leaked password protection** (plan Pro) : **activé**. |
| *Multi-Factor* | **TOTP** : activé (enrôlement et vérification). Téléphone : désactivé. |
| *Sessions* | **Time-box user sessions** : **12 h**. Inactivity timeout : vide (l'inactivité de 30 min est gérée par le portail, ADR 0012). |
| *JWT* (*Project Settings → JWT Keys* ou *Auth settings*) | **Durée du jeton d'accès : 900 secondes**. |
| *URL Configuration* | **Site URL** : l'adresse de la préproduction (étape 2), par ex. `https://portal-preprod.lexcanadalaw.com`. **Redirect URLs** : `https://<domaine>/api/auth/callback`, `https://<domaine>/en/**`, `https://<domaine>/fr/**`. |
| *Emails → SMTP Settings* | Voir l'étape 3. |
| *Emails → Templates / Security notifications* | Activez les 6 alertes (mot de passe, e-mail, ajout et retrait MFA, identité liée et retirée). Pour chacune, collez le **sujet** de `supabase/config.toml` (`[auth.email.notification.*]`) et le **HTML** du fichier `supabase/templates/*_notification.html` correspondant. |

### 1.5 Données de démonstration
*SQL Editor → New query* : collez tout le contenu de `supabase/preprod/demo-data.sql`, puis **Run**. On peut le relancer sans créer de doublon.

**Vérification** : *Table Editor → matters* : 3 dossiers `LC-2026-…`, avec `is_mock = true`.

### 1.6 Premier administrateur du cabinet
Il n'existe aucun compte au départ. Créez le vôtre en deux temps.

1. D'abord, *SQL Editor* :
```sql
select public.authorize_staff_provisioning('<votre-adresse>@lexcanadalaw.com', 'firm_admin', null);
```
   Exécutez cette requête **avant** de créer le compte. Sans autorisation préalable, la base refuse une adresse du cabinet qui ne passe pas par Microsoft. L'autorisation est valable 1 heure.
2. Ensuite, *Authentication → Users → Add user → Create new user* :
   - e-mail : **votre adresse `@lexcanadalaw.com`** ;
   - « Auto Confirm User » coché ;
   - mot de passe : si le formulaire l'exige, mettez une longue valeur aléatoire et **oubliez-la**. Un mot de passe ne donne jamais de droits au personnel : seule la connexion Microsoft compte (ADR 0009).

Le compte est créé avec le rôle `firm_admin`. Il devient utilisable à votre première connexion Microsoft (étape 4).

---

## Étape 2 — Vercel (samedi matin)
1. https://vercel.com → **Add New → Project** → importez `SmartegyCanada/lex-portal` (branche `main`).
2. **Framework** : Next.js (détecté). Ne modifiez pas les commandes.
3. *Settings → Functions → Region* : **Montréal, Canada (East) — yul1** (disponible). *Settings → General → Data Preferences* : **désactivez** « Improve models with this project's data ». Projet **neuf** : l'ancien projet « lex-law » de l'ancienne équipe n'est pas réutilisé (ADR 0041).
4. *Settings → Environment Variables* (environnement **Production**), une variable à la fois, à partir de `.env.example` :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (*anon* / *publishable*) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète (*service_role* / *secret*). **Cochez « Sensitive ».** |
| `APP_BASE_URL` | `https://<domaine-preprod>` |
| `CRON_SECRET` | 32 caractères aléatoires, générés par votre gestionnaire de mots de passe. **Sensitive.** |
| `SMTP_URL`, `EMAIL_FROM` | Étape 3 |
| `NEXT_PUBLIC_STAFF_SSO_ENABLED` | `false` pour l'instant (`true` à l'étape 4) |
| `INTEGRATION_MODE_*` | `mock` partout (Clio passe à `live` à l'étape 5) |
| `TRUSTED_PROXY_HOPS` | `1` |

5. **Domaine** (*Settings → Domains*) : `portal-preprod.lexcanadalaw.com`, ou l'adresse `*.vercel.app` pour commencer. Ajoutez l'enregistrement DNS indiqué par Vercel.
6. **Deploy**.

**Vérification** :
- `https://<domaine>/en/login` s'affiche ;
- `https://<domaine>/.well-known/security.txt` répond ;
- dans les outils du navigateur (*Réseau*), la page de connexion a les en-têtes `content-security-policy` et `strict-transport-security`.

---

## Étape 3 — E-mails par Microsoft 365 (samedi)
1. **Centre d'administration Microsoft 365** : créez une boîte, par ex. `portail@lexcanadalaw.com`. Une boîte partagée ne permet pas l'envoi SMTP authentifié ; prenez une boîte avec licence, ou un connecteur.
2. Pour cette boîte : *Paramètres de messagerie → Gérer les applications de messagerie* → cochez **SMTP authentifié**.
3. Si l'authentification multifacteur est imposée à la boîte, créez un **mot de passe d'application**. Sinon, utilisez un mot de passe fort et unique.
4. **Supabase**, *Authentication → Emails → SMTP Settings* :
   - hôte `smtp.office365.com`, port `587` ;
   - utilisateur : la boîte ; mot de passe : celui de l'étape précédente ;
   - expéditeur : la boîte, nom « Lex Canada Law ».
5. **Vercel** :
   - `SMTP_URL` = `smtp://portail%40lexcanadalaw.com:<mot-de-passe>@smtp.office365.com:587`. Le `@` de l'adresse s'écrit `%40` ; si le mot de passe contient des caractères spéciaux, encodez-les aussi. **Sensitive.**
   - `EMAIL_FROM` = `Lex Canada Law <portail@lexcanadalaw.com>`.
   - Redéployez.

**Vérification** : *Authentication → Users → …* sur votre compte → « Send password recovery ». L'e-mail doit arriver depuis `portail@lexcanadalaw.com`.

---

## Étape 4 — Connexion Microsoft du personnel
L'application Entra **existe déjà et est configurée** (2026-10-29, `docs/runbooks/connexion-microsoft-serveur-test.md`) : « Lex Canada Portal — Staff Auth », client `e7764f9e-7867-48ff-97b5-972ce7501b41`, locataire `428d7eab-9f1c-4b81-86fe-677c89ff7bd1`, comptes de ce répertoire uniquement, permissions déléguées avec consentement, claims `email` et `xms_edov`.
1. **Entra → Authentication** : ajoutez l'URI de redirection Web `https://<REF>.supabase.co/auth/v1/callback`.
2. **Supabase**, *Authentication → Providers → Azure* :
   - activé ;
   - Client ID : `e7764f9e-7867-48ff-97b5-972ce7501b41` ;
   - Secret : le secret client créé le 2026-10-29 (gestionnaire de mots de passe) ;
   - **Azure Tenant URL** = `https://login.microsoftonline.com/428d7eab-9f1c-4b81-86fe-677c89ff7bd1`, **jamais** `common`.
3. **Vercel** : `NEXT_PUBLIC_STAFF_SSO_ENABLED` = `true`, puis redéployez. Ne définissez **pas** `SUPABASE_PUBLIC_URL` (serveur de test uniquement).
4. Connectez-vous sur `https://<domaine>/en/staff/login` → « Se connecter avec Microsoft » avec le compte créé à l'étape 1.6.
5. Allez dans `/en/admin/staff` pour pré-créer les autres membres du personnel.

**Vérification** : `/en/admin` s'ouvre, et `/en/admin/staff` aussi (firm_admin).

---

## Étape 5 — Clio en lecture (samedi ou dimanche, dès que le portail Clio est prêt)
1. https://ca.developers.clio.com → **Create application** :
   - nom « Lex Canada Client Portal (préproduction) » ;
   - redirection : `https://<domaine>/api/integrations/clio/callback` ;
   - droits **en lecture seulement** : Matters, Contacts, Calendars, Billing, Users.
2. **Vercel** :
   - `CLIO_CLIENT_ID` ;
   - `CLIO_CLIENT_SECRET` (**Sensitive**) ;
   - `INTEGRATION_MODE_CLIO` = `live` ;
   - redéployez.
3. Dans le portail, allez dans `/en/admin/integrations` → **Connecter Clio**, puis connectez-vous avec **votre** compte Clio. Le jeton est conservé chiffré dans Supabase Vault et n'est jamais affiché (ADR 0014).
4. Toujours dans `/admin/integrations`, utilisez **Importer les dossiers d'un client** avec l'e-mail d'un contact **de test** dans Clio. Accordez ensuite l'accès dans « Dossiers et accès », ou invitez ce contact.
5. **Synchronisation automatique** : `vercel.json` la planifie **une fois par jour** (7 h UTC), seule fréquence permise par le plan Hobby de Vercel, qui refuse sinon de construire le site. Quand Clio passe en `live`, passer au **plan Pro** et remettre `*/30 * * * *`. `CRON_SECRET` doit être défini : Vercel l'envoie automatiquement.

---

## Étape 6 — Recette (dimanche soir / lundi matin)
1. `/admin/invitations` : invitez **une adresse de test à vous** (pas un vrai client) sur les dossiers de démonstration `LC-2026-0142` et `LC-2026-0115`.
2. Ouvrez l'e-mail, activez le compte, enrôlez la MFA, puis parcourez le portail sur ordinateur et sur téléphone.
3. Laissez la page inactive 28 minutes : la fenêtre « Votre session va expirer » doit apparaître.
4. Signalez-moi tout écart.

## En cas de problème
- **Rien ne s'affiche après un déploiement** : Vercel → *Deployments → le dernier → Logs*. Envoyez-moi le message d'erreur, **en masquant toute clé**.
- **Annuler un déploiement** : Vercel → *Deployments* → un déploiement précédent → **Promote to Production**.
