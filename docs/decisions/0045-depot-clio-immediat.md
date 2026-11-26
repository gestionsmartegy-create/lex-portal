# ADR 0045 — Dépôt immédiat du contrat validé dans Clio, pour la signature dans Clio

- **Statut** : accepté (2026-11-26, responsable du projet).
- **Contexte** : la signature se fait dans Clio (option A, décision du 2026-10-15) : le portail dépose le PDF validé dans le dossier Clio (ADR 0038), puis l'avocat lance la signature depuis Clio. Le dépôt n'était fait que par le planificateur, une fois par jour en préproduction : l'avocat devait attendre le lendemain pour signer. Le responsable veut un parcours **instantané et fluide** pour l'avocat.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Moment du dépôt | Juste après une validation réussie (et après « Réessayer »), le serveur lance le dépôt **en arrière-plan** avec `after()` de Next.js : la réponse à l'avocat n'attend pas Clio. `after()` est une API de Next.js, neutre vis-à-vis de l'hébergeur. |
| 2 | Concurrence | La réservation existante (`contract_deposit_claim`, `for update skip locked`, prochain essai repoussé) empêche un double dépôt si le planificateur passe en même temps. Aucune migration. |
| 3 | Échec | La validation reste faite ; le dépôt reste en file et le planificateur le reprend (délai croissant, 5 essais, puis « Ma journée → À traiter »). Le planificateur reste quotidien tant que le responsable technique n'a pas passé `vercel.json` à `*/30 * * * *` (plan Pro de Vercel requis ; fichier réservé). |
| 4 | Écran | Pendant le dépôt, le bloc « Rangement du contrat » affiche « dépôt dans Clio en cours… » et se relit seul (toutes les 3 s, au plus 1 min). Une fois déposé : message « lancez la signature depuis Clio » et bouton principal **« Signer dans Clio »** (dossier Clio, nouvel onglet). |
| 5 | Lien | Le bouton ouvre le **dossier** Clio : le format d'un lien vers un document précis n'est pas confirmé par la documentation de Clio (AGENTS.md §2.6). |
| 6 | Inchangé | Simulateur tant que `INTEGRATION_MODE_CLIO_DOCUMENTS` n'est pas `live` (aucun dépôt) ; aucune URL de Clio ni d'Amazon transmise au navigateur pour le fichier ; journal `contract.deposited` / `contract.deposit_failed`. |

## Conséquences
- `server/services/clio-deposits.ts` (`depositInBackground`), `server/services/contract-workflow.ts`, `components/admin/contract-editor/contract-lifecycle.tsx`, `messages/{fr,en}.json`.
- Tests unitaires : `tests/unit/clio-deposits.test.ts`.
- L'ADR 0005 (DocuSign) est marqué remplacé ; `docs/clio-api-mapping.md` est corrigé.
- Quand un avocat valide, le traitement peut aussi déposer jusqu'à 5 autres dépôts déjà dus (d'autres contrats) ; aucune donnée n'est exposée, chaque dépôt est journalisé par la base, sans auteur (service_role).
- La validation dure le temps de générer le PDF, comme avant ; le dépôt lui-même ne la ralentit pas. Sur Vercel, le travail en arrière-plan est limité par la durée maximale de la fonction.
