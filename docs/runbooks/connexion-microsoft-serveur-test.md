# Connexion Microsoft du personnel — serveur de test

> **Appliqué le 2026-10-29** dans le cadre de l'exception ADR 0040 (pas de responsable technique) : option A pour l'adresse publique (`lib/oauth-authorize-url.ts`, test `tests/unit/oauth-authorize-url.test.ts`).

## État côté Microsoft (fait le 2026-10-29)

Application « Lex Canada Portal — Staff Auth », locataire LEX CANADA LAW :

| Élément | Valeur |
|---|---|
| ID d'application (client) | `e7764f9e-7867-48ff-97b5-972ce7501b41` |
| ID de l'annuaire (locataire) | `428d7eab-9f1c-4b81-86fe-677c89ff7bd1` |
| Comptes | Single tenant (cabinet seulement) ; implicit grant désactivé |
| Adresses de retour | `https://lexlaw.2-24-110-184.sslip.io/auth/v1/callback`, `https://lexlaw.2-24-110-184.sslip.io/api/integrations/outlook/callback` (l'ancien Supabase a été retiré) |
| Permissions déléguées, consentement accordé | `User.Read`, `openid`, `email`, `profile`, `offline_access`, `Calendars.ReadBasic`, `Calendars.ReadWrite` |
| Claims facultatifs (jeton ID) | `email`, `xms_edov` (adresse vérifiée, nécessaire au rattachement au compte pré-créé) |
| Propriétaire | Wilson Saintelmy |
| Secret | Nouveau secret à créer par le cabinet ; l'ancien (ancienne équipe) sera supprimé après l'essai |
| Locataire | Security defaults actifs (MFA pour tous) |

## Pourquoi un changement est nécessaire sur le serveur de test seulement

Sur le serveur de test, l'application parle à Supabase Auth par l'adresse **interne** `http://gateway:8000`. `signInWithOAuth` renvoie donc une adresse `http://gateway:8000/auth/v1/authorize?…` que le navigateur ne peut pas joindre. En production (Vercel + Supabase hébergé), l'adresse est publique : **aucun changement n'y est nécessaire**.

## Changements proposés

### 1. `deploy/vps/docker-compose.yml`, service `auth`, bloc `environment`

```yaml
      # Connexion Microsoft du personnel (ADR 0010) : désactivée tant que STAFF_SSO_ENABLED ne vaut pas
      # « true » sur le serveur. Locataire du cabinet seulement (jamais « common »).
      GOTRUE_EXTERNAL_AZURE_ENABLED: ${STAFF_SSO_ENABLED:-false}
      GOTRUE_EXTERNAL_AZURE_CLIENT_ID: ${AZURE_CLIENT_ID:-}
      GOTRUE_EXTERNAL_AZURE_SECRET: ${AZURE_CLIENT_SECRET:-}
      GOTRUE_EXTERNAL_AZURE_URL: https://login.microsoftonline.com/${AZURE_TENANT_ID:-invalid}
      GOTRUE_EXTERNAL_AZURE_REDIRECT_URI: ${SITE_URL}/auth/v1/callback
```

(`environment` l'emporte sur la valeur `false` du fichier d'Auth ; la retirer de ce fichier pour la clarté.)

Service `app`, `build.args` : `NEXT_PUBLIC_STAFF_SSO_ENABLED: ${STAFF_SSO_ENABLED:-false}`.

### 2. `deploy/vps/lexlaw.caddy`

Ouvrir les deux seules routes OAuth, en GET :

```caddy
	@oauth {
		method GET
		path /auth/v1/authorize /auth/v1/callback
	}
	handle @oauth {
		reverse_proxy 127.0.0.1:54021
	}
```

### 3. Adresse publique de l'autorisation (au choix)

- **Option A, dans l'application (recommandée)** : variable serveur facultative `SUPABASE_PUBLIC_URL` (`server/env.ts`, `z.url().optional()`), valant `${SITE_URL}` sur le serveur de test ; dans `staffMicrosoftAction`, remplacer l'origine de `data.url` par cette adresse **seulement** si `data.url` a l'origine de `NEXT_PUBLIC_SUPABASE_URL` et le chemin `/auth/v1/authorize` ; sinon, retour à la page de connexion. Fonction pure + test unitaire.
- **Option B, dans Caddy seulement** : dans le `reverse_proxy 127.0.0.1:3100` de l'application,
  `header_down Location` et `header_down x-action-redirect` avec le motif `^http://gateway:8000/auth/v1/authorize\?` remplacé par `https://lexlaw.2-24-110-184.sslip.io/auth/v1/authorize?`.

## Après le déploiement (cabinet)

1. Créer le nouveau secret client dans Entra (12 mois), le garder dans le gestionnaire de mots de passe.
2. L'ajouter sur le serveur sans l'afficher, avec `STAFF_SSO_ENABLED=true`, `AZURE_CLIENT_ID` et `AZURE_TENANT_ID` (commande fournie au moment voulu), puis redéployer.
3. Créer le compte du membre du personnel dans `/admin/staff` avec son adresse Microsoft, puis « Se connecter avec Microsoft » sur `/fr/staff/login`.
4. Vérifier que `app_metadata.providers` contient `azure` et que l'espace cabinet s'ouvre ; supprimer ensuite l'ancien secret dans Entra.
