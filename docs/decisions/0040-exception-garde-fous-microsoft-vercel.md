# ADR 0040 — Exception aux garde-fous : connexion Microsoft et mise en ligne Vercel, sans responsable technique

- **Statut** : accepté par le responsable du projet (Chuck, Smartegy), le 2026-10-29.
- **Contexte** :
  - Le projet n'a pas de responsable technique humain disponible. Les garde-fous (`scripts/garde-fous.sh`) réservent à ce rôle la configuration du serveur de test, les fichiers de session et le déploiement hors du serveur de test.
  - La connexion Microsoft du personnel est configurée côté Entra (2026-10-29, `docs/runbooks/connexion-microsoft-serveur-test.md`). La brancher demande de modifier `deploy/vps/docker-compose.yml`, `deploy/vps/lexlaw.caddy`, `server/env.ts` et `server/actions/auth.ts`.
  - Le cabinet veut ensuite une préproduction sur Vercel (plan Pro, région Montréal `yul1`) avec un **nouveau** projet Supabase hébergé en `ca-central-1` (ADR 0013). L'ancien projet Supabase de l'ancienne équipe n'est pas réutilisé.
- **Décision** : exception **ciblée**, levée par le responsable du projet lui-même dans `scripts/garde-fous.sh` :
  1. l'agent peut modifier ces quatre fichiers : `deploy/vps/docker-compose.yml`, `deploy/vps/lexlaw.caddy`, `server/env.ts`, `server/actions/auth.ts` ;
  2. l'agent peut utiliser la CLI `vercel` (lier, déployer, consulter), **sauf** les variables (`vercel env`, `secrets`) et les suppressions (`remove`, `rm`, `project rm`, `domains rm`, `dns rm`) ;
  3. l'agent peut lier le projet à la base Supabase hébergée et y pousser les migrations (`supabase link --project-ref`, `supabase db push`), **sans** données de départ (`--include-seed`), sans `projects` (clés, suppression), sans `--linked` ni `--db-url` (donc jamais `db reset` distant).
  Ces limites ont été resserrées après la revue de sécurité du 2026-10-29 (correctif appliqué par le responsable du projet).
- **Ce qui reste protégé** :
  - les secrets : `.env*`, `supabase secrets`, `seed.local.md`, `ACCES.md` ;
  - la branche `main` et l'historique ;
  - les autres fichiers de sécurité : `proxy.ts`, `server/security/`, `server/auth/`, `server/db/` ;
  - la CI et les garde-fous eux-mêmes ;
  - la suppression de données, `db dump` et `db pull`, les autres serveurs que le serveur de test, et le projet bazila.
- **L'agent ne saisit jamais de secret.** Le responsable du projet colle lui-même les clés, mots de passe et secrets clients dans les tableaux de bord (Vercel, Supabase) ou sur le serveur, par une commande qui ne les affiche pas.
- **Compensations** :
  - chaque changement passe par la QA (`qa-fonctionnel`) et la revue de sécurité (`revue-securite`) ;
  - chaque changement est intégré par une demande de fusion dont la CI est verte ;
  - une revue de sécurité complète est faite avant toute donnée réelle ;
  - un **audit de sécurité par un professionnel humain** (une demi-journée) est fortement recommandé avant d'y mettre de vrais dossiers clients.
- **Conséquences** :
  - Il n'y a plus de relecture humaine indépendante des changements de connexion et de déploiement. Le risque est accepté par le responsable du projet, en connaissance de cause.
  - L'exception sera retirée quand un responsable technique sera nommé, ou au passage `PHASE=prod`.
