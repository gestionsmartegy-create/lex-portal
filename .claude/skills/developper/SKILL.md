---
name: developper
description: Flux complet et guidé pour TOUTE demande de code (utilisé par /ajouter, /modifier, /corriger, /nouvelle-page). Clarifier et confirmer, annoncer le plan, classer Interface / Serveur / Base de données, construire, QA (agent qa-fonctionnel), revue de sécurité (agent revue-securite), sauvegarder, déployer sur le serveur de test, puis expliquer exactement comment tester. L'argument est la demande, en français.
---

Tu accompagnes un développeur qui débute. Tu expliques ce que tu fais en français simple, une étape à la fois, et tu **n'écris aucune ligne de code avant son « oui »** à l'étape 1. Tu ne contournes jamais un garde-fou : si une action est refusée, tu le dis en une phrase et tu proposes le bon chemin.

Le skill appelant (`/ajouter`, `/modifier`, `/corriger`, `/nouvelle-page`) te donne le **type de branche** (`feat`, `fix`, `chore`) et parfois des consignes propres. Sinon, `feat`.

## 0. Prérequis
- `git branch --show-current`.
  - Sur `main` : `git fetch -q origin && git checkout -b <type>/<slug-court> origin/main` (slug en anglais, kebab-case, 2 à 4 mots). Dis : « Je travaille sur la branche `<nom>`. »
  - Sur une autre branche avec des modifications non sauvegardées (`git status --short`) : une seule question, « On continue sur cette branche ou on en ouvre une nouvelle ? ».
- Lis `AGENTS.md` §2 (règles absolues) et §3, puis `docs/implementation-roadmap.md` (phase en cours). Selon le domaine : `docs/page-map.md` et `docs/design-system.md` (interface), `docs/database.md` et `docs/security.md` (serveur, base).
- Repère les fichiers concernés (`grep`, `Glob`) et lis-les avant de reformuler.

## 1. Comprendre, puis confirmer
Reformule en cinq points courts :
1. **Ce qui va changer** (comportement, du point de vue de l'utilisateur).
2. **Où on le verra** : page(s) précise(s), en français **et** en anglais, sur ordinateur et sur téléphone.
3. **Type** : Interface, Serveur, Les deux, ou Base de données (ça décide la liste de contrôle de l'étape 3).
4. **Ce que j'ai décidé seul** là où la demande était floue.
5. **Ce que je ne ferai pas** (hors demande, ou interdit).

Pose **au plus deux questions**, seulement si deux lectures mènent à un résultat vraiment différent (utilise l'outil de question à choix).

**Refuse poliment et explique que c'est au responsable technique** (note dans la demande de fusion, ou message direct) si la demande touche : l'authentification, la MFA ou les sessions ; la RLS, les rôles ou les droits ; une migration qui supprime ou modifie une table existante ; des secrets ou des variables d'environnement ; la CSP ou les en-têtes (`proxy.ts`, `next.config.ts`, `server/security/`) ; une intégration en mode `live` ; un paiement ou une signature ; une question de `docs/open-questions.md` ; une phase de la roadmap non commencée ; une suppression de données ; la CI ou le déploiement.

Attends un **« oui »** explicite.

## 2. Annoncer le plan
Liste : fichiers à créer ou modifier, clés de traduction à ajouter (FR + EN), tests à ajouter ou adapter, vérifications qui suivront (QA, sécurité, déploiement). Plus de trois fichiers : passe en mode plan (CLAUDE.md).
**Aucune nouvelle librairie** sans l'avoir annoncée ici. Si elle est nécessaire : `/securite dependance <paquet>` **avant** `pnpm add`.

## 3. Construire
Le moins de fichiers possible, dans le style du fichier voisin. Pas de `any`. Jamais désactiver un test, une règle de lint ou un en-tête « pour faire passer » (AGENTS.md §2.12).

**Interface** : tout texte dans `messages/fr.json` **et** `messages/en.json` (clés hiérarchiques) ; couleurs et polices par les tokens de `docs/design-system.md` ; `"use client"` seulement en feuille, sans import de `@/server/` (hors actions) ; `label` sur chaque champ, focus visible, contrastes AA ; états chargement / vide / erreur ; badge « Données de démonstration » si `is_mock`.

**Serveur** : `import "server-only"` en tête ; entrée validée par Zod ; utilisateur et rôle revérifiés (`requireClientSession`, `requireStaff`, `getSessionRole`) ; `assertMatterAccess()` avant toute donnée d'un dossier ; colonnes explicites, jamais `select("*")` ; action sensible → `recordAudit` ; même 404 pour « inexistant » et « interdit » ; `hitRateLimit` sur un point d'entrée coûteux ; test Vitest ou d'intégration ajouté.

**Base de données** : **nouvelle** migration `supabase/migrations/<horodatage>_<nom>.sql` ; RLS, politiques, `GRANT` et tests pgTAP dans la même migration ; puis `pnpm db:reset && pnpm db:test && pnpm db:types` ; `docs/database.md` mis à jour.

Après construction : `pnpm lint && pnpm typecheck && pnpm test`, corrige, puis passe à la QA.

## 4. QA
Lance `/qa` (agent `qa-fonctionnel`). Lis le rapport. Corrige les ❌ et relance : **au plus deux tours**. Au troisième échec, arrête-toi et explique au développeur ce qui bloque et ce que tu proposes.

## 5. Sécurité
Lance `/securite` (agent `revue-securite`). Même règle des deux tours. Si une correction toucherait une zone réservée (authentification, sessions, RLS, CSP, `server/security/`, `server/auth/`) : arrête-toi, explique, et note-le pour le responsable technique dans la demande de fusion. Un ❌ qui reste ouvert **n'empêche pas** de déployer sur le serveur de test (phase de test), mais il est écrit en tête du rapport et **doit être corrigé avant d'intégrer dans `main`**.

## 6. Sauvegarder
`/sauvegarder` avec un message qui dit ce que le développeur a demandé.

## 7. Déployer sur le serveur de test
`/deployer`. Il met la branche en ligne sur le serveur de test et écrit la section « Comment tester ».

## 8. Conclure
Rapport au format AGENTS.md §9, en français simple :
1. ce qui a été réalisé ;
2. fichiers créés ou modifiés ;
3. vérifications exécutées et résultats (QA, sécurité, commandes) ;
4. limites et risques ;
5. décisions qui demandent une validation.

Puis la section **Comment tester** produite par `/deployer`, et ces deux phrases : « Si ce n'est pas ce que tu voulais : `/annuler` remet la version précédente. » et « Quand tu es satisfait : `/envoyer-pour-verification` ouvre la demande de fusion et l'intègre dans `main` dès que la CI est verte. »
