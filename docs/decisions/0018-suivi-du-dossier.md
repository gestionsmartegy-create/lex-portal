# ADR 0018 — Suivi du dossier et équipe gérés par le cabinet

- **Statut** : accepté (2026-10-07), choix du responsable du projet (option 1 sur 3)
- **Contexte** :
  - Clio ne fournit ni avancement ni étapes destinées au client (`docs/product-requirements.md` : « chronologie orientée client » non native).
  - Pour un dossier importé de Clio, la chronologie et la barre d'avancement restaient donc vides, et aucun écran ne permettait de les remplir.
  - L'équipe d'un dossier (`matter_team`), qui donne les droits du personnel (messages, étapes), n'était modifiable par aucun écran. Clio ne fournit que le nom de l'avocat responsable.

## Décision

| # | Sujet | Décision |
|---|---|---|
| 1 | Étapes | Saisies par le cabinet sur `/admin/matters/[id]/tracking` : ajouter, modifier, terminer ou rouvrir, monter ou descendre, supprimer. Réservé à l'**équipe du dossier** et au **firm_admin** : `assertMatterAccess(…, "read_write")` côté serveur, puis la RLS `timeline_staff_*`. La suppression est ajoutée par la migration `20261007120000_matter_tracking.sql`. |
| 2 | Avancement | Calculé par la base : un trigger fixe `matters.progress_percent` à la part des étapes terminées (NULL sans étape). L'application ne l'écrit jamais. L'équipe du dossier garde techniquement le droit de modifier `matters` (schéma initial), mais la valeur est recalculée à chaque changement d'étape ; restreindre ce droit par colonne serait une évolution à soumettre au responsable technique. |
| 2 bis | Dossier d'une étape | Une étape ne change jamais de dossier (trigger `matter_timeline_same_matter`) : l'avancement et l'audit restent justes. |
| 3 | Ordre | `public.move_timeline_step(step, ±1)` en **security invoker** (RLS de l'appelant) : échange avec la voisine, en passant par une position temporaire à cause de la contrainte unique. |
| 4 | Audit | Un trigger journalise `matter_timeline.added`, `completed`, `reopened`, `updated` et `removed`, avec les identifiants seulement (jamais le titre ni la description). L'équipe est déjà journalisée (`matter_team.added` / `removed`). |
| 5 | Client averti | Au plus un avis par étape toutes les 10 minutes. Une étape terminée crée une notification dans le portail (`matter_status_changed`, lien vers la chronologie) pour chaque client ayant un accès **actif** (service_role, usage permis : notifications). Pas d'e-mail pour l'instant. |
| 6 | Équipe | Sur la même page, le **firm_admin** ajoute un membre du personnel (avec son rôle) ou le retire. Le retrait coupe aussitôt ses droits, et les avis de nouveau message (ADR 0017). Le personnel de l'équipe voit l'équipe sans pouvoir la modifier. |

## Conséquences
- **Plus tard** :
  - des modèles d'étapes par domaine de droit, appliqués en un clic ;
  - l'affectation automatique de l'avocat responsable venant de Clio, à condition de confirmer que Clio fournit son adresse (`docs/clio-api-mapping.md`, AGENTS.md §2.6).
- **Tests** :
  - pgTAP `15_suivi_dossier` (27 cas : équipe, client, hors équipe, session par mot de passe, firm_admin, avancement, audit) ;
  - e2e `tracking.spec.ts` (parcours cabinet → client avec axe, 404 hors équipe, équipe en lecture pour le personnel).
