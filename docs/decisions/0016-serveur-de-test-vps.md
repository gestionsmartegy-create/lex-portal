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
| 9 | Intégrations | Toutes en `mock`, dont Clio (faux Clio). Pas de synchronisation planifiée. |
| 10 | Déploiement | `deploy/vps/scripts/deploy.sh`, depuis le poste du développeur : `git archive | ssh`. Le serveur n'a aucun accès à GitHub. |

## Conséquences
- L'hébergement de **production** reste à confirmer : Vercel (ADR 0013) ou VPS. Voir `docs/open-questions.md`.
- Le serveur n'a qu'un processeur : le build prend plusieurs minutes. La pile occupe environ 1,2 Go de mémoire.
- Pas de sauvegarde : le serveur ne contient que des données fictives.
