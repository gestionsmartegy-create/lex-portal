# ADR 0016 — Serveur de test sur le VPS Hostinger

- **Statut** : accepté (2026-10-04)
- **Contexte** : le responsable veut voir et tester le développement en ligne sur son VPS Hostinger (2.24.110.184), au lieu de Vercel. Ce VPS héberge déjà un autre projet (bazila-staging), auquel il ne faut pas toucher.

## Décision

| # | Sujet | Décision |
|---|---|---|
| 1 | Adresse | **https://lexlaw.2-24-110-184.sslip.io**. HTTPS automatique par le Caddy de l'hôte ; aucune configuration DNS. |
| 2 | Isolation | Tout est dans `/opt/lexlaw` (projet Compose `lexlaw`, réseau dédié). La seule chose ajoutée côté hôte est `/etc/caddy/sites/lexlaw.caddy`. Le Caddyfile, les autres sites et bazila ne sont pas modifiés. Avant le rechargement à chaud : `caddy validate` ; si la validation échoue, le site est retiré. |
| 3 | Pile | Pile Supabase **dédiée** : Postgres 17, Auth, PostgREST, aux mêmes versions que la CLI locale. Une passerelle Caddy interne remplace Kong. Mailpit, puis l'application (image `Dockerfile`, sortie `standalone`). **Pas de `supabase start`** : la CLI publie la base sur `0.0.0.0` avec des secrets de démonstration connus, et **Docker contourne ufw**. |
| 4 | Exposition | **Aucun port publié sur `0.0.0.0`.** Seuls `127.0.0.1:3100` (application), `127.0.0.1:54021` (passerelle, pour la seule route publique `GET /auth/v1/verify`) et `127.0.0.1:54025` (Mailpit) sont publiés. La base n'est jamais publiée. |
| 5 | Secrets | Générés **sur le serveur** par `init-secrets.sh` (`openssl rand` ; clés anon et service signées HS256), dans `/opt/lexlaw/.env` en `chmod 600`. Ils ne quittent jamais le serveur et ne sont jamais affichés. |
| 6 | Données | **Fictives seulement** : migrations du dépôt, puis le seed de démonstration (`supabase/seed.sql`). Les mots de passe des comptes fictifs sont générés sur le serveur et écrits dans `/opt/lexlaw/ACCES.md` (`chmod 600`), que le responsable lit lui-même. Réinitialisation : `migrate.sh --reset`. |
| 7 | Connexion de démonstration du personnel | Ouverte sur ce serveur par **`STAFF_DEMO_LOGIN=enabled`** (variable serveur, jamais `NEXT_PUBLIC_`). **Double verrou** : l'action n'accepte que des adresses `*.test`, et la base n'accorde des droits par mot de passe qu'aux domaines `allow_password`, que seul le seed de démonstration crée. En production, la variable est absente et le domaine `*.test` n'existe pas. |
| 8 | E-mails | Mailpit intercepte **tous** les e-mails : aucun n'est réellement envoyé. Sa boîte est consultable sur `/_mail`, derrière `basic_auth` (utilisateur `lex`, mot de passe dans `ACCES.md`). Le garde-fou STARTTLS (ADR 0013) considère un nom de service Docker sans point comme interne. |
| 9 | Intégrations | Toutes en `mock`. Clio : faux Clio par défaut, ou **compte Clio de test** (révision du 2026-10-06 ci-dessous). Pas de synchronisation planifiée. |
| 10 | Déploiement | `deploy/vps/scripts/deploy.sh`, depuis le poste du développeur : `git archive | ssh`. Le serveur n'a aucun accès à GitHub. |

## Conséquences
- L'hébergement de **production** reste à confirmer : Vercel (ADR 0013) ou VPS. Voir `docs/open-questions.md`.
- Le serveur n'a qu'un processeur : le build prend plusieurs minutes. La pile occupe environ 1,2 Go de mémoire.
- Pas de sauvegarde : le serveur ne contient que des données fictives.

## Révision du 2026-10-06 — Clio de test
Décision du responsable du projet (point 9) : le serveur peut se connecter à un **compte Clio de test** (compte développeur, dossiers fictifs uniquement), pour démontrer la vraie connexion OAuth, l'import et la synchronisation.
- **Jamais le Clio réel du cabinet** sur ce serveur : pas de sauvegarde, adresse temporaire, connexion de démonstration du personnel (points 6 et 7). Le vrai Clio attend la préproduction (`docs/runbooks/preprod-deploy.md`, étape 5).
- Application Clio en **lecture** ; adresse de retour `https://lexlaw.2-24-110-184.sslip.io/api/integrations/clio/callback`.
- Identifiants saisis **par le responsable, sur le serveur**, dans `/opt/lexlaw/clio.env` (`chmod 600` : `INTEGRATION_MODE_CLIO=live`, `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`), lu par `docker-compose.yml` (`env_file`, facultatif). Sans ce fichier, Clio reste en `mock`. Ils ne sont jamais dans le dépôt, le chat ni un journal.
- Le jeton OAuth obtenu au clic « Connecter Clio » est conservé chiffré dans Vault (ADR 0014). Retour en démonstration : supprimer `clio.env`, puis redéployer.
- Pas de synchronisation planifiée : import et synchronisation à la demande depuis `/admin/integrations`.
