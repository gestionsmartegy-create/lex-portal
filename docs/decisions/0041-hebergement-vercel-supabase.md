# ADR 0041 — Hébergement : Vercel (Montréal) et nouveau projet Supabase (Canada)

- **Statut** : accepté par le responsable du projet (Chuck, Smartegy), le 2026-10-29.
- **Contexte** :
  - L'hébergement de production restait ouvert (`docs/open-questions.md`) : Vercel (ADR 0013), Azure App Service ou le VPS du serveur de test (ADR 0016).
  - Le cabinet n'a pas de technicien pour entretenir un serveur : sauvegardes, mises à jour de sécurité, surveillance.
  - Le projet Supabase « lex law » de l'ancienne équipe (`wbdurfpdiazepevllvjr`) n'est pas maîtrisé par le cabinet. Sa région n'a jamais été vérifiée.
- **Décision** :
  - **Base, comptes, MFA et coffre-fort** : un **nouveau** projet Supabase hébergé, région **Canada (Central) `ca-central-1`**, créé par le cabinet avec son propre compte. L'ancien projet n'est pas réutilisé. Son adresse a été retirée de l'application Entra le 2026-10-29.
  - **Application** : Vercel, plan **Pro** (usage commercial ; planificateur toutes les 30 minutes), région des fonctions **Montréal `yul1`**, projet **neuf** branché sur `SmartegyCanada/lex-portal`. L'ancien projet Vercel « lex-law » (dépôt de l'ancienne équipe) n'est pas réutilisé ; il sera supprimé par le cabinet une fois la préproduction en ligne.
  - Sur le projet Vercel, le partage des données pour l'entraînement de modèles d'IA est **désactivé**.
  - **Azure App Service** est écarté pour l'instant : le code reste neutre (`output: "standalone"`), et un changement plus tard reste possible.
  - Le **VPS** reste le serveur de test, avec des données fictives seulement.
- **Conséquences** :
  - Les secrets (clés Supabase, `CRON_SECRET`, SMTP, secret Microsoft) sont saisis **par le cabinet** dans les tableaux de bord Vercel et Supabase, jamais par l'agent (ADR 0040).
  - Connexion Microsoft du personnel : on réutilise l'application Entra « Lex Canada Portal — Staff Auth », en y ajoutant l'adresse de retour `https://<ref>.supabase.co/auth/v1/callback` du nouveau projet. Côté code, rien ne change : l'adresse de Supabase hébergé est déjà publique.
  - Marche à suivre : `docs/runbooks/preprod-deploy.md`.
