---
name: deployer
description: Mettre la branche courante en ligne sur le serveur de TEST (lexlaw.2-24-110-184.sslip.io) et lui seul, vérifier qu'il répond, puis écrire la section « Comment tester » (adresse exacte, compte à utiliser, clics, résultat attendu, FR/EN, mobile). Sauvegarde d'abord ce qui ne l'est pas. Le développeur déploie quand il veut : rien ne bloque, hors la sauvegarde.
---

Un seul serveur existe pour toi : le **serveur de test** (ADR 0016, `docs/runbooks/test-server.md`), données fictives uniquement. Il n'y a pas encore de production ; quand elle existera, elle relèvera du responsable technique.

## 1. Préalables
- `git branch --show-current` n'est pas `main` (sinon : « on ne déploie pas main d'ici » et stop ; main arrive sur le serveur via une branche fusionnée).
- `git status --short` : s'il reste des modifications, lance `/sauvegarder` d'abord. Le script déploie **le dernier enregistrement** (`HEAD`), pas les fichiers non sauvegardés.
- Si `/qa` ou `/securite` ont laissé des ❌, rappelle-les en une ligne (« à corriger avant d'intégrer dans main ») et déploie quand même : c'est un serveur de test.
- Si `deploy/vps/scripts/deploy.sh` est absent du dépôt : il n'y a **pas encore de déploiement possible** pour cette branche. Propose un test local en mode production : `pnpm build && node scripts/serve-standalone.mts 3100` → `http://localhost:3100/en/login` (Supabase local démarré, `.env.local` écrit par `pnpm env:local`), et signale au responsable technique que la branche du serveur de test n'est pas dans `main`. Continue avec « Comment tester » adapté au local.

## 2. Déployer
`deploy/vps/scripts/deploy.sh` (sans argument). Il envoie le code par ssh, génère les secrets sur le serveur s'ils manquent, applique les migrations, reconstruit l'image (3 à 6 minutes, un seul processeur) et recharge le site Caddy. Il termine par `déployé : https://lexlaw.2-24-110-184.sslip.io`.

S'il échoue, lis les dernières lignes et explique en français :
- une faute dans un fichier que tu viens de modifier (le build Next.js échoue) → corrige, `/sauvegarder`, relance ;
- `ssh` refusé ou injoignable → la clé ssh de ce portable n'est pas sur le serveur, ou le réseau : prévenir le responsable technique ;
- `Caddy : configuration invalide` → prévenir le responsable technique, ne rien toucher sur le serveur.
Pour un diagnostic : `ssh root@2.24.110.184 "cd /opt/lexlaw && docker compose --env-file .env ps"` et `… logs --tail=40 app`. Jamais `cat` du `.env` ni de `ACCES.md`.

## 3. Vérifier que le site répond
- `curl -s -o /dev/null -w '%{http_code}' https://lexlaw.2-24-110-184.sslip.io/en/login` → 200 ;
- même chose pour `/fr/login` et `/.well-known/security.txt` ;
- `curl -sI https://lexlaw.2-24-110-184.sslip.io/en/login | grep -iE 'content-security-policy|strict-transport-security'` : les deux en-têtes présents.
Autre chose → « le site ne répond pas correctement », journal du conteneur `app`, et stop.

## 4. Écrire « Comment tester »
Toujours dans ce format, concret, pour quelqu'un qui n'a pas suivi le développement :

```
## Comment tester
Adresse : https://lexlaw.2-24-110-184.sslip.io/fr/<page précise>   (et /en/… pour l'anglais)
Compte : <client : john.doe@example.com | personnel : demo.admin@lexcanadalaw.test via /fr/staff/login>
         Les mots de passe sont dans /opt/lexlaw/ACCES.md sur le serveur :
         ouvre-les toi-même avec `ssh root@2.24.110.184 cat /opt/lexlaw/ACCES.md` (je n'ai pas le droit de les lire).
         Première connexion client : configure la double vérification avec une application d'authentification.
E-mails de test : https://lexlaw.2-24-110-184.sslip.io/_mail/ (utilisateur lex, mot de passe dans ACCES.md).
Étapes :
  1. …  (un clic ou une saisie par ligne)
  2. …
Résultat attendu : …
À vérifier aussi : la même page en anglais ; sur téléphone (outils du navigateur, largeur 375 px) ; un cas d'erreur : …
Si ce n'est pas ce que tu attendais : dis-moi ce que tu vois, ou lance /annuler.
```

Rappelle en une ligne que ce serveur ne contient que des données fictives et que `ssh root@2.24.110.184 /opt/lexlaw/scripts/migrate.sh --reset` les remet à zéro (avec confirmation).
