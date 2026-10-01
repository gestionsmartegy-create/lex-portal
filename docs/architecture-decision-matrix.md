# Matrice de décision d'architecture

Quatre options comparées. Notes sur 5 (5 = excellent). Ces notes sont des **estimations d'architecture** (hypothèses), pas des mesures vérifiées sur le terrain — elles doivent être challengées par le partenaire informatique du cabinet.

| Critère | Poids | A — Next.js + Supabase | B — Next.js + NestJS + PostgreSQL managé | C — Next.js + Azure (Entra, App Service/Container Apps, Functions, Key Vault, Service Bus) | D — Next.js + AWS (Cognito, RDS, Lambda/ECS, SQS) |
|---|---|---|---|---|---|
| Adéquation Microsoft 365 / SharePoint | 5 | 3 — Graph consommable depuis n'importe quel backend, mais pas de synergie d'identité native | 3 — identique à A pour l'intégration Graph | 5 — intégration native Entra ID, App Registration, Managed Identity | 3 — Graph consommable mais aucune synergie d'écosystème |
| Intégration Clio | 4 | 4 — appels REST standards, aucun avantage/inconvénient propre à la plateforme | 4 — identique | 4 — identique | 4 — identique |
| Sécurité (secrets, isolation) | 5 | 3 — coffre-fort à ajouter séparément (Supabase Vault limité), RLS puissant mais sous responsabilité de l'équipe | 4 — contrôle total du backend, coffre-fort dédié possible (ex. Vault) | 5 — Key Vault natif, Managed Identity, séparation réseau fine | 4 — Secrets Manager natif, IAM fin |
| Complexité de mise en œuvre | 3 (poids inversé : plus simple = mieux noté) | 5 — le plus simple à démarrer | 3 — backend et infra à opérer soi-même | 2 — complexité élevée (App Registration, réseaux, RBAC Azure) | 2 — complexité élevée (VPC, IAM, services multiples) |
| Rapidité de développement du MVP | 4 | 5 | 3 | 2 | 2 |
| Coût initial | 3 | 5 — gratuit/faible au démarrage | 3 | 2 | 2 |
| Coût récurrent à l'échelle du cabinet | 3 | 3 — abordable à petite échelle, coûts additionnels si volumes élevés | 3 | 3 | 3 |
| Compétences requises en interne/partenaire | 3 | 4 — stack courante | 3 | 2 — nécessite expertise Azure | 2 — nécessite expertise AWS |
| Résidence des données au Canada | 5 | 4 — région `ca-central-1` confirmée pour la base ; à valider pour les services annexes (e-mail auth, journaux) | 4 — dépend du fournisseur PostgreSQL managé choisi (à définir) | 5 — régions Azure Canada Central/East bien établies pour la souveraineté des données | 4 — région AWS Canada (Central) disponible, mêmes réserves que A |
| Gestion des comptes clients externes (B2C) | 4 | 4 — Supabase Auth adapté à ce cas d'usage | 3 — à construire soi-même ou via un fournisseur tiers | 4 — Entra External ID conçu pour ce cas | 4 — Cognito conçu pour ce cas |
| Traitements asynchrones / files de messages | 3 | 2 — nécessite un worker externe, pas de file native robuste | 4 — libre choix d'une file (BullMQ, etc.) | 5 — Service Bus natif | 5 — SQS natif |
| Supervision et observabilité | 3 | 3 — logs Supabase + Vercel, outillage tiers à ajouter | 3 — à instrumenter soi-même | 5 — Azure Monitor natif | 4 — CloudWatch natif |
| Dépendance fournisseur | 2 (poids inversé) | 3 — dépendance Supabase (Auth propriétaire) | 4 — plus portable (PostgreSQL standard + backend générique) | 2 — forte dépendance Microsoft | 2 — forte dépendance AWS |
| Support entreprise disponible | 3 | 3 — plans payants avec SLA | 3 — dépend du fournisseur PostgreSQL choisi | 5 — support Microsoft Enterprise, cohérent avec M365 déjà en place | 4 — support AWS Enterprise |
| Facilité de migration future | 2 | 3 | 4 | 2 | 2 |

## Synthèse pondérée (qualitative)

- **Option A (Next.js + Supabase)** : meilleure adéquation vitesse/coût pour un **MVP**, mais moins bien outillée nativement pour les traitements asynchrones et la gestion de secrets de niveau entreprise — compensable par des composants complémentaires (worker, coffre-fort dédié).
- **Option C (Azure)** : meilleure cohérence avec l'écosystème Microsoft 365 déjà en place chez Lex Canada Law (Entra ID, SharePoint, Key Vault), au prix d'une complexité et d'un coût de développement plus élevés.
- **Options B et D** : positions intermédiaires, sans avantage déterminant pour ce cas d'usage précis (cabinet déjà engagé sur Microsoft 365).

## Recommandation résultante

Voir la section 8 (« Recommandation ») du livrable de synthèse et `mvp-scope.md` : **Option A pour le MVP, avec migration ou hybridation vers des composants Azure (Key Vault pour les secrets, Entra ID pour le futur SSO interne) en Phase 2/3**, plutôt qu'un choix history définitif dès la Phase 0.

## Sources et niveau de confirmation

- Les capacités techniques précises de Clio et Supabase citées ici sont confirmées par leur documentation officielle respective (voir `clio-api-mapping.md` et `architecture-evaluation.md`).
- Les notations comparatives d'Azure et AWS sont des **hypothèses d'architecture générales**, non vérifiées par une documentation officielle consultée dans cette phase (hors du périmètre des sources imposées) ; elles reflètent des caractéristiques largement documentées de ces plateformes mais devraient être confirmées par un architecte cloud avant décision finale.
