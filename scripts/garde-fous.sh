#!/usr/bin/env bash
# Garde-fous pour Claude Code (hook PreToolUse, voir .claude/settings.json).
#
# Reçoit sur stdin le JSON de l'outil que Claude s'apprête à utiliser et
# refuse (code 2, message en français) tout ce qui toucherait la branche
# `main`, le serveur principal, les secrets, la sécurité (sessions, CSP,
# RLS) ou détruirait des données. Certaines actions ne sont pas refusées
# mais demandent une confirmation (ajout d'une librairie, par exemple).
#
# Pour une commande (outil Bash), on examine la commande ; pour une écriture
# de fichier (Write, Edit…), on examine le chemin du fichier, jamais son
# contenu : une documentation qui *mentionne* rm -rf n'est pas une suppression.
#
# Le responsable technique lève ces garde-fous sur SA machine en créant le
# fichier ~/.lex-portal-responsable-technique. Rien d'autre ne les lève.
set -u
[ -f "$HOME/.lex-portal-responsable-technique" ] && exit 0

# PHASE=test : jusqu'à la mise en production, le développeur est autonome — il déploie sur le
# serveur de test et intègre lui-même ses demandes quand la CI est verte (AGENTS.md §10).
# PHASE=prod : l'intégration et la fermeture des demandes redeviennent réservées au responsable technique.
PHASE=test

input=$(cat)
root="${CLAUDE_PROJECT_DIR:-.}"

refuse() { printf '⛔ %s\n' "$1" >&2; exit 2; }
# Laisse passer, mais Claude Code demande d'abord confirmation au développeur.
# (Le motif ne doit pas contenir de guillemet droit.)
demander() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# Extraction fiable des champs JSON avec Node (toujours présent : Node 24 est requis par le projet).
champ() {
  printf '%s' "$input" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const j = JSON.parse(s); const v = j[process.argv[1]] ?? j.tool_input?.[process.argv[1]]; process.stdout.write(v == null ? "" : String(v)); } catch {}
    });' "$1" 2>/dev/null
}
tool=$(champ tool_name)

# --- écritures de fichiers : seul le chemin compte ----------------------------
if [ "$tool" != "Bash" ]; then
  path=$(champ file_path)
  [ -z "$path" ] && exit 0
  rel="${path#"$root"/}"
  case "$rel" in
    .env.example) exit 0 ;;
    .env|.env.*|*/.env|*/.env.*)
      refuse "Les fichiers .env contiennent des secrets : on ne les modifie pas d'ici. Pour une nouvelle variable, ajoute son NOM (sans valeur) dans .env.example." ;;
    supabase/seed.local.md|supabase/.temp/*)
      refuse "Ce fichier contient des mots de passe de test ; il n'est ni lu ni modifié par l'agent." ;;
    # Exception ADR 0040 (responsable du projet, 2026-10-29) : connexion Microsoft.
    deploy/vps/docker-compose.yml|deploy/vps/lexlaw.caddy|server/env.ts|server/actions/auth.ts) exit 0 ;;
    .claude/*|scripts/garde-fous.sh|scripts/audit-routes.mts|deploy/*|Dockerfile|.dockerignore|.github/*|vercel.json|.gitleaks.toml|supabase/config.toml|AGENTS.md|CLAUDE.md|docs/runbooks/test-server.md)
      refuse "Ce fichier fait partie des garde-fous, de la CI ou du déploiement : il relève du responsable technique. Explique le besoin dans /envoyer-pour-verification." ;;
    proxy.ts|next.config.ts|server/security/*|server/auth/*|server/db/*|server/env.ts|server/actions/auth.ts|supabase/schema.sql|lib/safe-redirect.ts|lib/session-timeout.ts|lib/auth-constants.ts)
      refuse "Ce fichier touche à la sécurité (sessions, CSP, accès à la base) : il relève du responsable technique. Décris ce dont tu as besoin dans /envoyer-pour-verification." ;;
    types/database.ts)
      refuse "Fichier généré : lance « pnpm db:types » au lieu de l'éditer (AGENTS.md §3)." ;;
    supabase/migrations/*)
      [ -f "$path" ] && refuse "Une migration déjà écrite ne se modifie jamais (AGENTS.md §6) : crée une NOUVELLE migration." ;;
    package.json|pnpm-lock.yaml|pnpm-workspace.yaml)
      demander "Modifier les dépendances à la main ? La voie normale est /securite dependance <paquet> puis pnpm add <paquet>." ;;
  esac
  exit 0
fi

# --- commandes ------------------------------------------------------------------
cmd=$(champ command)
[ -z "$cmd" ] && exit 0
hit() { printf '%s' "$cmd" | grep -qiE "$1"; }
# Fin de mot : espace, séparateur de shell, fin de ligne.
END='( |;|&|\||\)|$)'
# Dans un segment de commande (sans traverser | ; &).
SEG='[^|;&]*'

# Branche principale : rien ne s'y pousse, rien ne s'y écrit.
branche=$(git -C "$root" branch --show-current 2>/dev/null || true)
if [ "$branche" = "main" ] && hit "git$SEG (commit|add|rm|mv|stash)$END"; then
  refuse "On ne travaille jamais directement sur main. Lance /ajouter, /modifier ou /corriger : une branche feat/… ou fix/… sera créée."
fi
hit "git$SEG push$SEG(--force|-f$END|--force-with-lease|--delete|-d$END| main$END|origin main|:main$END|HEAD:main)" \
  && refuse "Rien ne se pousse directement sur main : le code y arrive par une demande de fusion dont la CI est verte (/envoyer-pour-verification), c'est le filet de sécurité."
hit "git$SEG (checkout|switch)$SEG main$END" \
  && refuse "On ne se place pas sur main. Pour repartir de la version à jour : git fetch origin && git checkout -b feat/<nom> origin/main."
hit "git$SEG (merge|rebase|cherry-pick|reset --hard|reset --soft|reset --mixed|branch -D|branch -d|branch -M|branch -m|clean|stash drop|stash clear|commit --amend|filter-branch|filter-repo|update-ref|reflog expire|gc --prune)" \
  && refuse "Cette commande réécrit ou fusionne l'historique localement. Pour annuler le dernier changement : /annuler ; pour intégrer dans main : /envoyer-pour-verification (demande de fusion + CI)."
if [ "$PHASE" = "prod" ]; then
  hit "gh$SEG (pr merge|pr close|pr delete)$END" \
    && refuse "En production, l'intégration des demandes relève du responsable technique (AGENTS.md §10)."
  hit "gh api$SEG merge" && refuse "En production, l'intégration relève du responsable technique."
fi
hit "gh$SEG pr merge$SEG--admin" \
  && refuse "Jamais d'intégration forcée (--admin) : une demande s'intègre quand la CI est verte, pas avant."
hit "gh$SEG (repo delete|repo edit|secret|variable|release|ruleset)$END" \
  && refuse "La gestion du dépôt (réglages, secrets, versions) relève du responsable technique."
hit "gh api$SEG(/secrets|/variables|-X DELETE|--method DELETE|rulesets|branches/main/protection)" \
  && refuse "Cette requête GitHub supprime ou touche aux secrets ou aux protections : elle relève du responsable technique."

# Serveur : seul le serveur de TEST (ADR 0016, docs/runbooks/test-server.md) existe pour le développeur,
# et il se déploie uniquement par deploy/vps/scripts/deploy.sh, sans argument.
TEST_HOST='2\.24\.110\.184|lexlaw\.2-24-110-184\.sslip\.io'
hit "deploy/vps/scripts/deploy\.sh +[^ ;&|]" \
  && refuse "Le script de déploiement n'accepte pas de cible ici : lance deploy/vps/scripts/deploy.sh sans argument (serveur de test). Un autre serveur relève du responsable technique."
hit "(^|[ ;&|])scripts/deploy/(deploy|ssh|site|update|bootstrap)\.sh" \
  && refuse "Ces scripts n'existent pas dans ce projet : le déploiement se fait par deploy/vps/scripts/deploy.sh."
if hit "(^|[ ;&|])(ssh|scp|sftp|rsync) " && ! hit "$TEST_HOST"; then
  refuse "Seul le serveur de test (lexlaw.2-24-110-184.sslip.io) est à ta disposition. Tout autre serveur relève du responsable technique."
fi
hit "ACCES\.md" \
  && refuse "ACCES.md contient les mots de passe des comptes de test : c'est le développeur qui le lit lui-même (ssh root@2.24.110.184 cat /opt/lexlaw/ACCES.md), jamais l'agent."
hit "bazila" && refuse "Le projet bazila sur le VPS ne doit jamais être touché (ADR 0016)."
hit "/etc/caddy/(Caddyfile|sites/[a-z-]*bazila)" && refuse "La configuration Caddy de l'hôte relève du responsable technique (ADR 0016)."
hit "(apt|apt-get|ufw|systemctl|reboot|shutdown|useradd|passwd|chmod +[0-7]+ +/etc)$END" \
  && refuse "L'administration du système (paquets, pare-feu, services) relève du responsable technique."
hit "migrate\.sh +--reset" \
  && demander "Réinitialiser la base du serveur de test ? Toutes les données fictives et les comptes créés seront effacés ; de nouveaux mots de passe seront écrits dans ACCES.md."
hit "docker$SEG compose$SEG (down|rm|stop)$END" && ! hit "$TEST_HOST" \
  && demander "Arrêter des conteneurs locaux ? Pour la base locale, préfère pnpm db:stop."
# Correctif ADR 0040 : la CLI vercel est permise (préproduction), sauf secrets et suppressions.
hit "(^|[ ;&|(])vercel$SEG (env|secrets|remove|rm|project rm|projects rm|domains rm|dns rm|teams)$END" \
  && refuse "Vercel : les variables (secrets) et les suppressions relèvent du responsable du projet, dans le tableau de bord (ADR 0040)."
hit "supabase$SEG (logout|orgs|projects|secrets|branches|functions deploy|db pull|db dump|db remote|config push|migration repair|--linked|--db-url|--include-seed|--include-all)" \
  && refuse "Cette commande vise une base Supabase DISTANTE. Ici, seule la base locale est utilisée (pnpm db:start, db:reset, db:test). Le serveur relève du responsable technique."
hit "docker$SEG compose$SEG down$SEG-v|docker$SEG volume$SEG (rm|prune)|docker$SEG system prune" \
  && refuse "Cela effacerait des données Docker (base locale ou serveur). Pour repartir de zéro en local : pnpm db:reset."

# Secrets.
sans_exemple=$(printf '%s' "$cmd" | sed 's/\.env\.example//g; s/--env-file \.env//g')
if printf '%s' "$sans_exemple" | grep -qiE "(^|[^a-zA-Z0-9_])\.env($END|\.)" ; then
  hit "^cp +\.env\.example +\.env\.local$END" || refuse "Les fichiers .env contiennent des secrets : on ne les affiche pas et on ne les modifie pas. Pour connaître une variable, lis .env.example ; pour les valeurs locales, pnpm env:local les écrit sans les afficher."
fi
hit "seed\.local\.md" && refuse "supabase/seed.local.md contient les mots de passe de test : ouvre-le toi-même, l'agent ne doit pas le lire."
hit "(curl|wget)$SEG\|$SEG(sh|bash|zsh|node)$END" \
  && refuse "Jamais de script distant exécuté directement (curl | sh)."
hit "(^|[ ;&|])sudo " && refuse "Pas de sudo depuis l'agent."

# Données.
hit "(DROP +(TABLE|SCHEMA|DATABASE|POLICY|ROLE|FUNCTION)|TRUNCATE|DELETE +FROM|ALTER +ROLE|REVOKE)" \
  && refuse "Aucune suppression ou changement de droits direct en base. Une évolution du schéma passe par une NOUVELLE migration, relue par le responsable technique."
if hit "(^|[ ;&|])rm +-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r|r)[a-zA-Z]* " \
  && ! hit "rm +-[a-zA-Z]+ +(\./)?(\.next|node_modules|\.tmp|playwright-report|test-results|coverage|\.semgrep)/?$END"; then
  refuse "Pas de suppression récursive (sauf les dossiers de build : .next, node_modules, .tmp, playwright-report, test-results, coverage). Dis-moi ce que tu veux retirer et je le ferai fichier par fichier."
fi

# Dépendances : pas refusé, mais confirmé (revue /securite dependance <paquet> d'abord).
hit "(^|[ ;&|])(pnpm|npm|yarn|bun) +(add|install|i|up|update|upgrade|remove|rm|uninstall) +[^-]" \
  && demander "Ajouter ou changer une librairie ? Lance d'abord /securite dependance <paquet> (vulnérabilités, maintenance, licence)."
hit "(^|[ ;&|])(pnpm dlx|npx|bunx) " \
  && demander "Exécuter un paquet téléchargé à la volée ? Vérifie que c'est bien le paquet voulu (nom exact, éditeur)."

exit 0
