# ADR 0032 — Contrats : rédaction dans la plateforme (lot 1)

- **Statut** : accepté (2026-10-18). C'est le lot 1 du plan `docs/plan-contrats.md` (stories F1, F2, F3).
- **Contexte** : le cabinet veut rédiger, modifier et suivre ses contrats dans la plateforme : fiche du client (nom, courriel, adresse, téléphone, langue), modèles, services, aide de l'IA (OpenAI), envoi et suivi. Les contrats finaux iront dans Clio et dans SharePoint (décision du 2026-10-18).

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Pages | `/admin/contracts` (liste, filtres), `/admin/contracts/new`, `/admin/contracts/[id]` (rédaction), `/admin/contracts/[id]/print` (aperçu imprimable), onglet « Contrats » du dossier. Entrée « Contrats » dans le menu du personnel. |
| 2 | Données | `contracts` (en-tête et **copie** de la fiche du client, propre au contrat), `contract_sections` (contenu JSON ProseMirror), `contract_versions` (copies complètes). RLS : auteur, équipe du dossier lié, firm_admin. Aucune suppression : annulation avec motif. Pas d'accès client à ce lot. |
| 3 | Verrou | Une personne à la fois : le verrou (5 min) est renouvelé toutes les 2 minutes par l'éditeur. La base refuse toute écriture du contenu sans le verrou (`private.can_edit_contract`, garde-fou `55006`). Les autres voient « En cours de modification par … », en lecture seule. |
| 4 | Éditeur | TipTap 3.32.0, épinglé, avec les extensions choisies une à une (pas de liens, pas de `linkifyjs`). Revue de dépendance du 2026-10-18 : `injectCSS: false` (CSP) et `immediatelyRender: false`. Le contenu est échangé **uniquement en JSON** (texte JSON borné, puis liste blanche Zod), jamais en HTML. Le nœud « champ » ne se crée pas par collage. Le rendu en lecture convertit le JSON en éléments React (liste blanche), sans `dangerouslySetInnerHTML`. |
| 5 | Champs | `client.*`, `matter.*`, `lawyer.name`, `firm.name`, `date.today`, remplis à l'affichage. Un champ vide est surligné et listé « À compléter ». La validation (lot 3) sera bloquée tant qu'il en reste. |
| 6 | IA | Bouton « Aide à la rédaction » sur chaque section : rédiger, reformuler, simplifier, traduire. **Simulateur** (`INTEGRATION_MODE_AI=mock`). Le mode `live` échoue tant que le cabinet n'a pas décidé (plan §6). Le texte envoyé est **masqué** (nom, courriel, adresse, téléphone du client remplacés par des étiquettes), la proposition s'affiche à côté et n'est écrite qu'après acceptation. La section est alors marquée « rédigée avec l'IA, à réviser ». Limite : 30 demandes par personne et par 10 minutes. Journal `contract.ai_assisted`, sans contenu. |
| 7 | Journal | `contract.created`, `contract.<statut>`, `contract.matter_linked`, `contract.version_saved`, `contract.version_restored`, `contract.ai_assisted`. Jamais le contenu ni les coordonnées du client. |

## Conséquences
- **Migration** `20261020120000_contracts.sql`.
- **Tests** :
  - pgTAP `25_contrats.test.sql` (30 tests) ;
  - unitaires `contract-doc.test.ts` (liste blanche, champs, masquage) ;
  - e2e `contracts.spec.ts` (création, rédaction, IA, version, aperçu, accès refusé, verrou), sur ordinateur et à 375 px, avec axe.
- **Reporté** :
  - modèles, clauses, services et taxes (lot 2) ;
  - validation, PDF figé, envoi, suivi, portail client (lot 3) ;
  - dépôt dans Clio et SharePoint (lot 4) ;
  - OpenAI (lot 5) ;
  - désignation de collaborateurs sur un contrat sans dossier.
- **Responsable technique** : la règle Trusted Types `ProseMirrorClipboard` (collage) est à prévoir lors du passage de Trusted Types en mode bloquant (J6).
