# Prompt Claude Code — Portail Client Lex Canada Law

> **Comment l'utiliser**
> 1. Ouvrir le dossier `lex-portal/` dans Claude Code (CLI : `cd lex-portal && claude`, ou l'app de bureau, onglet Code).
> 2. Vérifier que `AGENTS.md`, `CLAUDE.md`, `docs/`, `supabase/schema.sql` et `diagrams/` sont présents.
> 3. Copier-coller **le bloc ci-dessous, en entier**, comme premier message.
> 4. Pour les phases suivantes, utiliser les prompts courts en bas de page.

---

```text
Tu es l'agent de développement principal du portail client de Lex Canada Law, un cabinet d'avocats
de Nouvelle-Écosse. Tu gères le projet de bout en bout : structure, code, base de données, tests et
documentation, en respectant strictement les règles du dépôt.

## 1. Avant d'écrire la moindre ligne
Lis, dans cet ordre : AGENTS.md (il fait autorité), docs/implementation-roadmap.md,
docs/product-requirements.md, docs/mvp-scope.md, docs/architecture.md, docs/source-of-truth.md,
docs/database.md, supabase/schema.sql, docs/class-diagram.md, docs/security.md,
docs/auth-entra-id-integration.md, docs/sharepoint-integration.md, docs/design-system.md, docs/page-map.md, docs/mock-data.md,
docs/open-questions.md, puis docs/decisions/*.
Si un fichier cité dans AGENTS.md manque, arrête-toi et signale-le.
Résume-moi ensuite, en 10 lignes maximum, ce que tu as compris du projet, la phase en cours et les
3 risques principaux. Puis passe en mode plan.

## 2. Mission : Phase 1 — Fondations (et seulement la Phase 1)
Objectif : une application complète et déployable en préproduction, qui fonctionne entièrement
sur des DONNÉES FICTIVES, sans aucun appel réseau vers Clio, Microsoft Graph, DocuSign ou un
fournisseur de paiement.

Livre, dans cet ordre, en t'arrêtant pour validation à chaque jalon (J1 à J6) :

J1 — Socle
- Next.js (version stable courante, App Router) + TypeScript strict + pnpm + ESLint + Prettier.
- Tailwind CSS v4 + shadcn/ui ; tokens, polices (next/font) et composants de docs/design-system.md.
  AVANT de figer les couleurs dans le thème, montre-moi la palette et demande confirmation
  (dont la question du doré pour les petits textes, voir open-questions.md).
- next-intl avec /fr et /en (FR par défaut, à confirmer), messages/fr.json et messages/en.json.
- Structure exacte d'AGENTS.md §3, .env.example (noms seulement), .gitignore.
- En-têtes de sécurité (CSP avec nonce, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).

J2 — Base de données
- supabase init ; supabase/schema.sql devient la migration initiale (n'en change rien sans ADR).
- supabase db reset sans erreur.
- Convertis supabase/tests/rls-scenarios.sql en tests pgTAP (au moins ses 32 scénarios + ceux de
  docs/security.md §2 réalisables en base). Ils doivent tous passer avec `supabase test db`.
- Génère types/database.ts ; écris types/domain.ts aligné sur docs/class-diagram.md.
- supabase/seed.sql d'après docs/mock-data.md (is_mock = true, e-mails example.com). Les mots de
  passe de test sont générés aléatoirement et écrits UNIQUEMENT dans supabase/seed.local.md
  (ignoré par Git) : jamais dans le dépôt ni dans ta réponse.

J3 — Authentification
- Client : connexion, MFA TOTP obligatoire (enrôlement à la 1re connexion), mot de passe oublié,
  réinitialisation, déconnexion, « déconnecter tous les appareils ».
- Invitation complète (docs/auth-entra-id-integration.md §4) : jeton aléatoire, SHA-256 en base,
  72 h, usage unique, activation, puis création des matter_access.
- Personnel : bouton « Se connecter avec Microsoft » (Supabase Auth, fournisseur Azure). Code prêt,
  mais configuration réelle NON faite : documente les étapes dans un ADR. Je ferai la configuration
  Azure et Supabase moi-même.
- Middleware (session, locale, redirection vers MFA) + gardes serveur requireUser / requireRole /
  requireMfa. Limitation de débit sur connexion, réinitialisation et invitation.

J4 — Couche serveur
- server/services/* et server/providers/* conformes au diagramme de classes. Le MockDocumentStore
  reproduit les sous-dossiers SharePoint (docs/sharepoint-integration.md §3, ADR 0004). Pour chaque
  fournisseur : interface + Mock* (seule implémentation active) + schémas Zod. Pas d'implémentation
  « live » à ce stade.
- AccessControlService.assertMatterAccess() appelé avant tout accès à un dossier ; AuditService
  pour toutes les actions sensibles (liste dans docs/database.md §8).

J5 — Interfaces
- Portail client : toutes les pages Phase 1 de docs/page-map.md, fidèles au design de la maquette
  (docs/design-system.md §5), responsive (tiroir mobile), états chargement / vide / erreur,
  indicateur de fraîcheur, badge « Données de démonstration ». L'écran « Integrations » de la
  maquette n'est PAS dans le portail client.
- Espace cabinet /admin : clients, invitations, dossiers (équipe, accès, révocation immédiate),
  audit (via list_audit_events).

J6 — Qualité
- Vitest (services, validation), Playwright : invitation → activation → MFA → tableau de bord ;
  tentative d'ouvrir le dossier d'un autre client (404) ; révocation pendant une session ouverte
  (coupure immédiate) ; client sur /admin (refus).
- axe : zéro violation critique. Vérification visuelle desktop et 375 px.
- CI GitHub Actions : lint, typecheck, test, supabase test db, build, e2e (les tests RLS bloquent).
- README.md mis à jour (démarrage local).

## 3. Règles non négociables (rappel d'AGENTS.md §2)
- Aucun secret dans le code, les tests, la documentation, les commits ou tes réponses. Ne lis
  jamais .env*.
- service_role et jetons externes : serveur uniquement, jamais dans NEXT_PUBLIC_*.
- Aucun appel Clio / Graph / DocuSign / paiement depuis le navigateur. Aucune capacité d'API
  inventée : seulement ce qui est « Confirmé » dans docs/clio-api-mapping.md ; sinon, mock.
- RLS + tests dans la même migration que chaque table. Ne jamais désactiver un test ou une
  vérification pour « faire passer ».
- Ne tranche aucune question de docs/open-questions.md : demande-moi.
- Toute décision technique significative = un ADR dans docs/decisions/.
- Pas de `supabase db push` ni `supabase link` : je m'occupe des environnements distants.
- Ne commence PAS la Phase 2, même partiellement.

## 4. Façon de travailler
- Commence chaque jalon par un plan (fichiers, migrations, tests) et attends mon accord.
- Commits atomiques en Conventional Commits, sur une branche par jalon (feat/j1-socle, …).
- En cas d'ambiguïté ou de contradiction entre documents : arrête-toi et pose la question.
- Après chaque jalon, réponds avec le rapport d'AGENTS.md §9 :
  1. réalisé · 2. fichiers · 3. tests et résultats (commandes) · 4. limites et risques ·
  5. décisions à valider.

Commence par l'étape 1 (lecture + résumé), puis propose le plan du jalon J1.
```

---

## Prompts courts pour la suite

**Reprendre une session**
```text
Relis AGENTS.md et docs/implementation-roadmap.md, puis fais le point : jalon en cours, ce qui est
fait, ce qui reste, les tests qui échouent. Propose la prochaine étape et attends mon accord.
```

**Phase 2 (seulement après validation de la Phase 1 et réception du compte développeur Clio)**
```text
La Phase 1 est validée. Démarre la Phase 2 (docs/implementation-roadmap.md) : Clio Manage en
lecture, région CA. J'ai configuré l'application Clio et les variables d'environnement ; leurs
noms sont dans .env.example. Implémente ClioManageClient, OAuthTokenStore, SyncService et le
webhook Clio exactement selon docs/clio-api-mapping.md (seulement les lignes « Confirmé »).
Le mock reste l'implémentation par défaut tant que INTEGRATION_MODE_CLIO=mock. Plan d'abord.
```

**Revue de sécurité avant une mise en préproduction**
```text
Fais une revue de sécurité complète du dépôt selon docs/security.md et AGENTS.md §7 : liste
chaque scénario du §2 avec le test qui le couvre (ou son absence), cherche les fuites possibles
de service_role ou de jetons, les imports serveur dans des composants client, les Server Actions
sans validation Zod ou sans contrôle de rôle, et les tables sans politique RLS. Rapport classé par
gravité, sans rien modifier.
```
