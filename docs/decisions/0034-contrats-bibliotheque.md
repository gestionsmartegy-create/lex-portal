# ADR 0034 — Contrats : modèles, clauses, services et taxes (lot 2)

- **Statut** : accepté (2026-10-19). C'est le lot 2 du plan `docs/plan-contrats.md` (stories F4, F5 et F6), qui fait suite à l'ADR 0032.
- **Contexte** : le cabinet veut partir de modèles prêts, insérer des clauses types et chiffrer les services avec les taxes de la province du client. Il a fourni ses conditions générales (« Lex Canada Client Service Terms », PDF en anglais) comme premier modèle, avec l'option « renseigner ou signer ».

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Pages | Les sous-pages de `/admin/contracts` ont des onglets : Contrats, Modèles, Clauses, Services et taxes. Elles sont aussi accessibles depuis le sous-menu « Contrats ».<br/>- `/admin/contracts/templates` : tout le personnel ; il utilise un modèle publié.<br/>- `/admin/contracts/clauses` et `/admin/contracts/services` : firm_admin seulement ; les autres reçoivent la même 404. |
| 2 | Modèles | `contract_templates` (nom, domaine, langue, mode de signature, statut `draft`, `published` ou `archived`, `needs_review`, version courante) et `contract_template_versions` (copie figée des sections et des lignes de services).<br/>Le personnel ne voit que les modèles publiés.<br/>Un contrat créé depuis un modèle **copie** son contenu, sa langue et ses services, et garde `template_id` et `template_version`. Modifier un modèle ne change jamais un contrat déjà créé. |
| 3 | Modifier un modèle | Le firm_admin ouvre un **contrat-brouillon de modèle** (`template_draft`) dans l'éditeur habituel (verrou, versions, champs, IA). Il le publie ensuite : c'est `public.contract_template_publish`, qui crée la version N+1, ferme le brouillon et retire `needs_review`.<br/>« Enregistrer comme modèle » depuis n'importe quel contrat : `public.contract_template_from_contract`, qui crée le modèle en brouillon.<br/>Les brouillons de modèle n'apparaissent pas dans la liste des contrats. |
| 4 | Signature (décision du 2026-10-19) | Chaque modèle porte un mode : `clio` (signature dans Clio, ADR du 2026-10-15), `portal` (acceptation dans le portail, pour des conditions générales) ou `both` (au choix lors de l'envoi). Le parcours d'envoi et d'acceptation arrive au **lot 3**. |
| 5 | Modèles de départ | Les conditions générales du cabinet, en deux modèles anglais publiés en mode `portal` : « Businesses & Organizations » et « Individuals & Families » (décision du 2026-10-19). Ils se terminent par une section d'acceptation (nom du client, date, ligne de signature).<br/>Les **traductions françaises** sont des brouillons `needs_review` (« À faire valider par un avocat »), à publier par un firm_admin après relecture.<br/>Un modèle de démonstration « Convention d'honoraires — Immigration » (`is_mock`, mode `clio`) montre le tableau des services. |
| 6 | Clauses | `contract_clauses` (titre, langue, domaine, texte, actif) et `contract_clause_history` (chaque modification garde la version précédente, par trigger).<br/>Dans l'éditeur, « Insérer une clause… » propose les clauses actives dans la langue du contrat. Elles sont insérées **en JSON** au curseur, jamais en HTML. |
| 7 | Services et taxes | `service_catalog` (noms FR et EN, forfait ou horaire, montant `numeric`), `contract_line_items` (au plus 100 lignes par contrat, écriture avec le verrou) et `tax_rates` (province, code, taux en pour cent, période, `needs_verification`).<br/>La province du client (`contracts.client_province`) donne les taux en vigueur à la date du jour.<br/>Les calculs se font **en centimes exacts** (`lib/money.ts`, BigInt, arrondi au demi-cent supérieur par taxe), dans l'éditeur et sur le serveur. Les champs `fees.subtotal`, `fees.taxes` et `fees.total` sont remplis à l'affichage. L'aperçu imprimable ajoute l'annexe « Services et honoraires ». |
| 8 | Taux de départ | NB 15 %, NS 14 % (depuis le 2025-04-01), ON 13 %, PE 15 %, NL 15 % (TVH) ; QC TPS 5 % et TVQ 9,975 % ; autre TPS 5 %.<br/>Ils sont tous marqués « à vérifier » tant que le cabinet ne les a pas confirmés. L'éditeur l'indique. |
| 9 | Droits | La RLS réserve l'écriture des modèles, des clauses, des services et des taux au firm_admin. Les Server Actions revérifient le rôle (`requireStaff(locale, ["firm_admin"])`) et valident l'entrée avec Zod. |
| 10 | Journal | Par trigger :<br/>- `contract_template.created` / `updated` ;<br/>- `contract_clause.created` / `updated` ;<br/>- `service_catalog.created` / `updated` ;<br/>- `tax_rate.created` / `updated`.<br/>Par les fonctions : `contract_template.created`, `contract_template.published`.<br/>Jamais le contenu. |
| 11 | Corrections (QA et revue de sécurité du 2026-10-19) | Migration `20261021120100_contract_library_fixes.sql` :<br/>- « Enregistrer comme modèle » crée un **brouillon**, à relire et publier ;<br/>- un modèle n'entre ni ne sort du brouillon par une simple mise à jour (trigger `guard_contract_template_status`), seule `contract_template_publish` le publie ;<br/>- le tableau des services est remplacé en une transaction (`public.contract_replace_lines`, security invoker : la RLS et le verrou s'appliquent).<br/>Dans l'application :<br/>- case obligatoire « J'ai retiré toute donnée propre au client » avant d'enregistrer un modèle, car il sera visible de tout le personnel ;<br/>- taxes calculées au taux en vigueur **à la date de création du contrat** ;<br/>- mention « taux à vérifier » sur l'aperçu imprimable ;<br/>- échec de copie d'un modèle signalé ;<br/>- brouillons de modèle exclus de la recherche Ctrl K. |

## Conséquences
- **Migrations** `20261021120000_contract_library.sql` et `20261021120100_contract_library_fixes.sql`.
- **Tests** :
  - pgTAP `26_bibliotheque_contrats.test.sql` (32 tests) ;
  - unitaires `money.test.ts` ;
  - e2e `contract-library.spec.ts` (partir d'un modèle, taxes du Nouveau-Brunswick, catalogue, 404 pour le personnel simple, clauses, services et taux, « Enregistrer comme modèle » en brouillon), sur ordinateur et à 375 px, avec axe.
- **À fournir par le cabinet** :
  - relecture des traductions françaises ;
  - vrais modèles, services et tarifs ;
  - confirmation des taux de taxes.
- **Reporté** :
  - envoi, acceptation dans le portail, signature dans Clio (lot 3) ;
  - dépôt dans Clio et SharePoint (lot 4) ;
  - OpenAI (lot 5).
