# Flux de travail du développeur avec Claude Code

> Pour le développeur qui rejoint le projet. Tout se fait depuis Claude Code, en français, avec des commandes `/…` (skills). Elles encadrent chaque étape : comprendre, construire, vérifier, sécuriser, mettre en ligne sur le serveur de test, transmettre. Le responsable technique relit et fusionne.

## 1. Une journée type

| Moment | Commande | Ce qui se passe |
|---|---|---|
| Début de session | `/statut` | Branche, travail récent, sauvegarde, CI, serveur de test, Supabase local |
| Première fois ou après redémarrage | `/demarrer` | Outils, dépendances, Supabase local, données fictives, `pnpm dev` |
| Nouvelle fonctionnalité | `/ajouter <demande>` | Reformulation → **oui** → plan → code → QA → sécurité → sauvegarde → serveur de test → « comment tester » |
| Changer un comportement ou l'apparence | `/modifier <demande>` | Idem, avec « avant → après » |
| Un bug | `/corriger <description>` | Reproduction par un test, cause, correction à la racine, même flux |
| Un texte | `/traduire <texte>` | FR **et** EN, parité vérifiée, flux allégé |
| Une page | `/nouvelle-page <nom> dans portal\|admin` | Copie de la page la plus proche, garde de session, navigation, test e2e |
| Vérifier à part | `/qa`, `/securite`, `/securite dependance <paquet>` | Les agents QA et sécurité, à la demande |
| Voir en ligne | `/deployer` | Serveur de test uniquement, puis « comment tester » |
| Enregistrer | `/sauvegarder [message]` | Commit + push de la branche |
| Revenir en arrière | `/annuler` | Défait le dernier enregistrement, rien n'est perdu |
| Intégrer | `/envoyer-pour-verification` | Demande de fusion vers `main` avec les rapports ; **en phase de test, le développeur l'intègre lui-même dès que la CI est verte** (confirmation demandée) |

Toute demande de code passe par le flux `/developper` (les skills ci-dessus l'appellent). Il ne commence à écrire qu'après un « oui » explicite, et il s'arrête de lui-même quand la demande touche la sécurité, la base ou une décision ouverte.

**Phase de test (jusqu'à la production).** Le développeur est autonome : il déploie sur le serveur de test quand il veut et intègre ses demandes dans `main` lui-même, à une condition : **la CI est verte** (`app`, `database`, `secrets`). Un ❌ de la revue de sécurité ne bloque pas le serveur de test, mais se corrige avant d'intégrer. Avant la production, le responsable technique passera `PHASE=prod` dans `scripts/garde-fous.sh` : l'intégration redeviendra une relecture obligatoire.

## 2. Les deux agents

- **QA (`qa-fonctionnel`)** : lint, types, format, tests unitaires, build, pgTAP, intégration, e2e Playwright + axe, parcours des pages touchées en FR et EN, bureau et 375 px. Rapport vert/rouge ; ne modifie rien.
- **Sécurité (`revue-securite`)** : vulnérabilités connues des dépendances (`pnpm audit`, OSV), maintenance et licence d'une librairie à ajouter, routes et actions authentifiées (`node scripts/audit-routes.mts --changed`), secrets, liste AGENTS.md §7. Un ❌ se corrige avant d'intégrer dans `main` ; en phase de test, il ne bloque ni la sauvegarde ni le serveur de test.

## 3. Le serveur de test

- Adresse : https://lexlaw.2-24-110-184.sslip.io (ADR 0016, `docs/runbooks/test-server.md`). Données **fictives uniquement**.
- Déploiement : `deploy/vps/scripts/deploy.sh`, lancé par `/deployer`. Il met en ligne **le dernier enregistrement de la branche ouverte** ; le serveur affiche donc la dernière branche déployée, par qui que ce soit.
- Comptes de test : `ssh root@2.24.110.184 cat /opt/lexlaw/ACCES.md` — à lire **soi-même** ; Claude n'y a pas accès.
- Il n'existe **aucune autre cible**. La préproduction et la production relèvent du responsable technique.

## 4. Ce que Claude refusera (et pourquoi)

Les garde-fous (`scripts/garde-fous.sh`, branchés dans `.claude/settings.json`) bloquent, avec un message en français :

- écrire ou pousser **directement** sur `main` (le code y arrive par une demande de fusion et la CI), réécrire l'historique (`rebase`, `reset --hard`, `--force`, `--amend`), intégrer de force (`--admin`) ;
- déployer ailleurs que sur le serveur de test, ou y toucher à `bazila`, au Caddy de l'hôte, au système ;
- lire ou modifier `.env*`, `supabase/seed.local.md`, `ACCES.md` ;
- modifier `proxy.ts`, `next.config.ts`, `server/security/`, `server/auth/`, `server/db/`, `server/env.ts`, une migration existante, `types/database.ts`, les skills, la CI, le déploiement ;
- supprimer des données (`DROP`, `TRUNCATE`, `DELETE FROM`, `rm -rf`, volumes Docker), exécuter un script distant (`curl | sh`), `sudo`.

Et il **demande confirmation** avant : `pnpm add` (après `/securite dependance`), `npx`/`pnpm dlx`, une modification à la main de `package.json`, la réinitialisation de la base du serveur de test.

Quand un garde-fou se déclenche, Claude l'explique et propose le bon chemin, en général `/envoyer-pour-verification` avec une note pour le responsable technique. Il ne cherche jamais à contourner.

## 5. Pour le responsable technique

- Lever les garde-fous sur votre machine : `touch ~/.lex-portal-responsable-technique`. Rien d'autre ne les lève.
- Passer en production : `PHASE=prod` dans `scripts/garde-fous.sh` (l'intégration des demandes redevient réservée), et protéger `main` sur GitHub si le plan le permet.
- Les routes publiques « par conception » sont listées dans `scripts/audit-routes.mts` (`PUBLIC_ROUTES`) : toute nouvelle route API hors de cette liste doit vérifier une session, un secret ou une signature.
- La section « Hérité » des rapports de sécurité recense les points du code existant, hors de la branche du développeur, à traiter à votre rythme.
