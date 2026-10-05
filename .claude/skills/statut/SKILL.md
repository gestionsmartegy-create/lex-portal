---
name: statut
description: Où en est le travail — branche, ce qui a été fait récemment, ce qui n'est pas sauvegardé, l'état de la CI et de la demande de fusion, si le serveur de test est en ligne, si Supabase local tourne. À lancer en début de session.
---

Réponds en français, sans jargon, cinq lignes au plus par rubrique. Ne montre pas les commandes ; montre ce qu'elles t'apprennent.

1. **La branche.** `git branch --show-current`. Sur `main` : « Tu es sur main : rien ne s'y modifie. Dis-moi ce que tu veux faire, /ajouter ou /corriger ouvrira une branche. » Sinon, nomme-la et dis en une phrase ce qu'elle contient (`git log origin/main..HEAD --format='%s'` après `git fetch -q origin`).
2. **Ce qui a été fait.** `git log -8 --format='%ad · %s' --date=short`. Reformule chaque ligne en français courant.
3. **Ce qui n'est pas sauvegardé.** `git status --short`. Des fichiers → « des modifications ne sont pas encore sauvegardées » et propose `/sauvegarder`.
4. **La demande de fusion et la CI.** `gh pr list --head <branche> --state open --json number,url,isDraft,title`. S'il y en a une : `gh pr checks <numéro>` → résume « CI verte », « CI en cours » ou « CI rouge : <contrôle> ». Rouge → propose de regarder le journal (`gh pr checks <numéro> --json name,link`) et de corriger. Pas de demande, mais des changements en avance sur `main` → propose `/envoyer-pour-verification` (demande de fusion, puis intégration quand la CI est verte).
5. **Le serveur de test.** `curl -s -o /dev/null -w '%{http_code}' https://lexlaw.2-24-110-184.sslip.io/en/login`. 200 → « le serveur de test est en ligne ». Sinon → « il ne répond pas » et propose `/deployer` ou de prévenir le responsable technique. Précise que ce serveur affiche la **dernière branche déployée** (pas forcément la tienne).
6. **L'environnement local.** `pnpm exec supabase status >/dev/null 2>&1` → « Supabase local tourne » ou « arrêté : `/demarrer` le relance ».

Termine par : « Dis-moi ce que tu veux ajouter, modifier ou corriger. »
