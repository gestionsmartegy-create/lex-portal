# Serveur de test — lexlaw.2-24-110-184.sslip.io

> Environnement de **test**, avec des **données fictives uniquement** (ADR 0016). Ne jamais y mettre de vraies données client.

## Adresses
- Portail client : https://lexlaw.2-24-110-184.sslip.io/fr/login
- Espace cabinet (connexion de démonstration) : https://lexlaw.2-24-110-184.sslip.io/fr/staff/login
- Boîte d'e-mails de test : https://lexlaw.2-24-110-184.sslip.io/_mail/

## Accès (mots de passe)
Ils sont générés sur le serveur ; personne ne les a vus. Pour les lire :
```bash
ssh root@2.24.110.184 cat /opt/lexlaw/ACCES.md
```

## Premier test conseillé
1. Ouvrez la boîte d'e-mails de test, avec l'utilisateur `lex`.
2. Connectez-vous comme `demo.admin@lexcanadalaw.test`, puis **Invitations** → invitez une adresse de test, par exemple `vous.test@example.com`, sur un dossier.
3. Dans la boîte d'e-mails de test, ouvrez l'invitation, puis activez le compte et la double vérification avec une application d'authentification.
4. Suivez la check-list `docs/user-stories.md`.

## Redéployer (développeur)
```bash
deploy/vps/scripts/deploy.sh
```

## Réinitialiser les données de test
```bash
ssh root@2.24.110.184 /opt/lexlaw/scripts/migrate.sh --reset
```

## Ce qui ne doit jamais être touché
Le projet **bazila-staging** (`/opt/bazila`, ses conteneurs, `/etc/caddy/sites/bazila-staging.caddy`) et le Caddyfile principal.
