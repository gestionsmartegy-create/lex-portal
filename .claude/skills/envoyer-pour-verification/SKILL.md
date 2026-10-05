---
name: envoyer-pour-verification
description: Intégrer le travail de la branche dans main — ouvrir (ou mettre à jour) la demande de fusion avec un résumé en français, les rapports QA et sécurité et « comment tester », attendre que la CI soit verte, puis fusionner. En phase de test, le développeur fusionne lui-même ; avant la production, le responsable technique réactivera la relecture obligatoire (PHASE=prod dans scripts/garde-fous.sh).
---

**Phase actuelle : test.** Le développeur est autonome : la demande de fusion sert de trace et la **CI verte est le filet de sécurité** (AGENTS.md §10 : on ne fusionne jamais avec un contrôle rouge ou en cours). Si `PHASE=prod` est écrit dans `scripts/garde-fous.sh`, arrête-toi à l'étape 6 et demande la relecture du responsable technique (`ciriusblack`) au lieu de fusionner.

1. `git branch --show-current` : `main` → arrête-toi. Sauvegarde ce qui ne l'est pas (`/sauvegarder`), puis `git fetch -q origin`.
2. `git log origin/main..HEAD --format='%s'` : la liste des changements. Vide → « Rien de nouveau à intégrer. »
3. Si `/qa` et `/securite` n'ont pas été passés depuis la dernière sauvegarde, lance-les maintenant : leurs verdicts vont dans la description.
   - Un **❌ de sécurité** ouvert : ne fusionne pas. Corrige d'abord ; si la correction est réservée (authentification, sessions, RLS, CSP, `server/security/`, `server/auth/`), ouvre la demande **en brouillon** avec le ❌ expliqué en tête et préviens le responsable technique.
   - Un **❌ de QA** (test rouge, build cassé) : la CI sera rouge de toute façon ; corrige d'abord.
4. **La description**, en français :
   ```
   ## Demande
   <ce qui a été demandé, une ou deux phrases>
   ## Ce qui a changé
   <pages, écrans, services ; listes courtes>
   ## Décisions prises seul
   <ou « aucune »>
   ## Vérifications
   - QA : <verdict de l'agent qa-fonctionnel, une ligne>
   - Sécurité : <verdict de l'agent revue-securite, une ligne> ; audit des routes : <n ✅ / n ⚠️ / n ❌>
   - Hérité (hors de cette branche, pour le responsable technique) : <section 📋 du rapport, ou « rien »>
   ## Comment tester
   <la section produite par /deployer, ou « pas déployé sur le serveur de test : <raison> »>
   ## Points à regarder
   <données, sécurité, performance, question ouverte — ou la NOTE pour le responsable technique>
   ```
5. **La demande de fusion** (`gh auth status` doit réussir ; sinon donne l'adresse `https://github.com/SmartegyCanada/lex-portal/compare/main...<branche>?expand=1` et le texte à coller) :
   - déjà ouverte (`gh pr list --head <branche> --state open --json number,isDraft`) : `gh pr edit <n> --body "<description>"`, puis `gh pr ready <n>` si elle était en brouillon et que rien ne l'exige plus ;
   - sinon : `gh pr create --base main --head <branche> --title "<type>(<portée>): <titre court>" --body "<description>"` (`--draft` si un ❌ reste ouvert).
6. **La CI.** `gh pr checks <n> --watch` (jusqu'à 30 minutes ; les trois contrôles : `app`, `database`, `secrets`).
   - Verte → `gh pr merge <n> --squash --delete-branch` (Claude Code demande une confirmation au développeur à ce moment : c'est voulu). La prochaine demande partira de `origin/main` (`/ajouter` s'en charge).
   - Rouge → **ne fusionne pas**. Ouvre le journal (`gh pr checks <n> --json name,link,state`), explique en français quel contrôle échoue et pourquoi, corrige, `/sauvegarder`, et la CI repart. Jamais `--admin`, jamais de test, de lint ou d'en-tête désactivé pour « faire passer » (AGENTS.md §2.12).
   - En cours au-delà de 30 minutes → dis-le et propose de relancer `/statut` plus tard.
7. Réponds : « Intégré dans main : <titre> — <url>. » Rappelle que le serveur de test affiche la dernière **branche** déployée : pour y voir l'ensemble à jour, la prochaine branche ouverte par `/ajouter` partira de `main` et `/deployer` la mettra en ligne. Si une note pour le responsable technique a été écrite : « Le responsable technique a été prévenu dans la demande : <point>. »
