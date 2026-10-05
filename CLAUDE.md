# CLAUDE.md

Les règles du projet sont dans AGENTS.md, qui fait autorité pour tous les agents :

@AGENTS.md

## Spécifique à Claude Code

- **Avant une tâche de plus de quelques fichiers** : passer en mode plan, présenter le plan (fichiers, migrations, tests), puis attendre la validation.
- **Recherches larges** dans `docs/` ou dans le code : déléguer à un sous-agent Explore, pour garder le contexte principal propre.
- **Après toute modification de schéma** : `supabase db reset && supabase test db`, puis `supabase gen types typescript --local > types/database.ts`.
- **Vérification visuelle** : lancer `pnpm dev` et contrôler la page dans le navigateur (desktop, puis 375 px de large) avant d'annoncer une tâche d'interface terminée. Comparer avec `docs/design-system.md`.
- **Ne jamais lire** `.env`, `.env.local`, `.env.*.local`, `supabase/seed.local.md` (bloqués dans `.claude/settings.json`). Pour connaître une variable, lire `.env.example`.
- **Ne jamais saisir** de mot de passe, de clé ou de jeton réel. Les comptes de test sont générés par le seed.
- Quand une règle d'AGENTS.md empêche de terminer une tâche, s'arrêter et l'expliquer. Ne jamais contourner la règle.
- Répondre en **français** ; le code et les identifiants restent en anglais.

## Flux guidé du développeur

Le développeur **parle normalement**, en français : « je veux ajouter une page qui… », « change la couleur du bouton… », « ça plante quand… », « le texte devrait dire… ». Les `/commandes` ne sont que des raccourcis. **Toute demande qui aboutit à du code suit le flux `/developper`** (reformuler et attendre un « oui », annoncer le plan, construire, QA par l'agent `qa-fonctionnel`, revue par l'agent `revue-securite`, `/sauvegarder`, `/deployer` sur le **serveur de test uniquement**, puis la section « Comment tester »), via le skill qui correspond :

| Il dit… | Skill à appliquer |
|---|---|
| ajouter, créer, afficher quelque chose de nouveau | `/ajouter` |
| une nouvelle page, un nouvel écran | `/nouvelle-page` |
| changer, déplacer, modifier ce qui existe | `/modifier` |
| ça ne marche pas, bug, erreur, plante | `/corriger` |
| un texte, un libellé, une traduction | `/traduire` |
| où on en est, qu'est-ce qui a été fait | `/statut` |
| lancer le projet, ça ne démarre pas | `/demarrer` |
| vérifier, tester, est-ce que c'est bon | `/qa`, puis `/securite` |
| mettre en ligne, voir sur le serveur | `/deployer` |
| enregistrer, sauvegarder | `/sauvegarder` |
| revenir en arrière, annuler | `/annuler` |
| c'est fini, intégrer, envoyer | `/envoyer-pour-verification` |

En phase de test (`PHASE=test` dans `scripts/garde-fous.sh`), le développeur intègre lui-même dans `main` via `/envoyer-pour-verification`, à condition que la CI soit verte.

- Les garde-fous (`scripts/garde-fous.sh`, hook dans `.claude/settings.json`) refusent tout ce qui touche `main` directement, l'historique, les secrets, la sécurité (`proxy.ts`, `server/security/`, `server/auth/`, `server/db/`), les migrations existantes, le déploiement hors serveur de test et la suppression de données. Si une action est refusée : l'expliquer en une phrase, proposer le bon chemin, ne jamais contourner.
- `node scripts/audit-routes.mts --changed` vérifie que chaque route, page protégée et Server Action touchée revérifie la session ; les routes publiques par conception sont listées dans le script.
- Guide complet : `docs/runbooks/flux-developpeur.md`.
