# ADR 0019 — Modèles de dossiers, informations du dossier et demandes de documents

- **Statut** : accepté (2026-10-07), demande du responsable du projet
- **Contexte** : le cabinet veut :
  - choisir le **type de dossier** (domaines de lexcanadalaw.com/expertise), avec des **étapes prédéfinies** ;
  - que l'administrateur puisse ajouter des étapes et des **champs** ;
  - que l'**avocat du dossier puisse demander des documents** au client depuis son compte.
  Clio ne fournit ni étapes ni informations orientées client (ADR 0018).

## Décision

| # | Sujet | Décision |
|---|---|---|
| 1 | Types et modèles | `matter_types`, `matter_type_steps`, `matter_type_documents` et `matter_type_fields` (migration `20261007130000`), bilingues. Le personnel les lit ; seul le **firm_admin** les modifie (RLS + `requireStaff`), sur `/admin/templates`. |
| 2 | Contenu initial | 26 types repris des domaines du site, dont l'immigration détaillée selon les 5 voies du site. Étapes, documents et champs : **première version à valider par le cabinet** (migration `20261007130100`, idempotente). |
| 3 | Dossier | `matters.matter_type_id` est choisi par l'équipe du dossier. « Ajouter les étapes du modèle » ajoute à la fin les étapes absentes (même titre). Une étape type garde sa version anglaise (`title_en`), et le client la voit dans sa langue. Une étape modifiée à la main perd sa version anglaise. |
| 4 | Informations du dossier | `matter_field_values` : écriture par l'équipe ou le firm_admin. Un trigger impose que le champ appartienne au type du dossier. Le client ne lit que les champs marqués visibles (RLS), avec leur libellé. |
| 5 | Demandes de documents | Sur la page « Suivi du dossier », l'équipe demande un document (type ou libre) à un client ayant un **accès actif** (trigger). Auteur, statut initial et date de réception sont posés par la base. Création et changements de statut sont journalisés (identifiants seulement). Le client reçoit un avis dans le portail (`document_requested`). Statuts : en attente, reçu, annulé ; « en retard » est calculé avec la date limite. |
| 6 | Limite | Le **dépôt en ligne** par le client attend SharePoint et l'antivirus (questions ouvertes, Phase 3). En attendant, le client transmet le document par la messagerie ou par courriel, et l'avocat le marque « reçu ». |

## Conséquences
- **Le cabinet valide et ajuste** les modèles dans « Modèles de dossiers ». Les changements valent pour la suite et ne modifient pas les dossiers en cours.
- **Tests** :
  - pgTAP `16_modeles_dossiers` (24 cas) ;
  - e2e `templates.spec.ts` : parcours cabinet → client avec axe, et 404 du personnel sur les modèles. Chaque exécution a son propre dossier fictif.

## Renforcements après revue de sécurité (migration `20261007130200`)
- L'auteur d'une demande de document ne change jamais (trigger).
- Le genre d'un champ (texte, date, nombre) est figé dès qu'il a des valeurs. Le serveur valide chaque valeur selon son genre, et une date invalide s'affiche telle quelle chez le client au lieu de faire planter la page.
- Changer le type d'un dossier efface les informations de l'ancien type.
- Toute modification des modèles est journalisée (`matter_template.*`, et `matter_template.field_visibility` quand un champ devient visible ou interne), ainsi que le type et les informations d'un dossier (`matter.type_set`, `matter.fields_updated`). Le journal ne contient que des identifiants et des booléens.
