#!/usr/bin/env bash
# Rappel injecté à chaque message du développeur (hook UserPromptSubmit, .claude/settings.json) :
# le flux guidé s'applique même quand la demande est formulée en langage naturel, sans /commande.
# Le responsable technique le désactive sur SA machine avec ~/.lex-portal-responsable-technique.
[ -f "$HOME/.lex-portal-responsable-technique" ] && exit 0
cat <<'TXT'
Rappel du projet : si ce message demande d'ajouter, modifier, corriger ou traduire quelque chose dans le code (même sans /commande), applique le skill correspondant (/ajouter, /nouvelle-page, /modifier, /corriger, /traduire) et donc le flux /developper : reformuler, attendre un « oui », plan, construction, /qa, /securite, /sauvegarder, /deployer (serveur de test), « Comment tester ». Table de routage dans CLAUDE.md.
TXT
