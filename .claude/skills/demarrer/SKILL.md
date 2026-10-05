---
name: demarrer
description: Préparer et lancer l'environnement local — Node 24, dépendances, Supabase local (Docker), migrations et données fictives, variables locales, serveur de développement — puis dire où ouvrir le site et où trouver les comptes de test. À lancer la première fois et après un redémarrage.
---

Explique chaque étape en une ligne, exécute, et arrête-toi au premier échec avec la cause probable et la solution.

1. **Outils.** `node --version` (24 ou plus ; sinon `nvm use`, fichier `.nvmrc`), `pnpm --version` (11 ; `corepack enable` si absent), `docker info >/dev/null 2>&1` (sinon : ouvrir OrbStack ou Docker Desktop ; `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` si `docker` ne trouve pas le démon).
2. **Dépendances.** `pnpm install --frozen-lockfile`.
3. **Base locale.** `pnpm db:start` (la première fois : plusieurs minutes de téléchargement). Puis `pnpm db:reset` (migrations + données fictives), `pnpm db:seed-passwords` (mots de passe des comptes de test, écrits dans `supabase/seed.local.md`, jamais affichés), `pnpm env:local` (écrit `.env.local` sans afficher les valeurs).
4. **Vérification rapide.** `pnpm db:test` (tests pgTAP) doit être vert. Si rouge sur un environnement neuf, c'est à signaler au responsable technique, pas à corriger.
5. **Serveur de développement.** `pnpm dev` en arrière-plan. Site : `http://localhost:3000/fr/login` et `/en/login`. E-mails locaux (Mailpit) : `http://127.0.0.1:54324`.
6. **Comptes de test.** Dis : « Les comptes et mots de passe de test sont dans `supabase/seed.local.md` : ouvre-le toi-même, je n'ai pas le droit de le lire. Client : `john.doe@example.com` (double vérification à configurer à la première connexion). Personnel : `demo.admin@lexcanadalaw.test` via `/fr/staff/login`, formulaire de démonstration. »
7. Termine par `/statut`.

Si le développeur veut seulement relancer après un redémarrage : étapes 3 (`pnpm db:start` seul), 5 et 7.
