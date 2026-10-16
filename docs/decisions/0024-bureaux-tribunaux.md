# ADR 0024 — Bureaux et tribunaux

- **Statut** : accepté (2026-10-15). C'est le lot 1 du plan « bureaux et calendrier de cour » (`docs/plan-bureaux-calendrier.md`). Les bureaux ont été décidés par le cabinet le 2026-10-15 : Ottawa, Halifax et Montréal.
- **Contexte** : le calendrier de cour (lots 2 à 5) a besoin de bureaux (fuseau, province) et d'une liste de tribunaux. Jusqu'ici, ni l'un ni l'autre n'existait.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Bureaux | Table `public.offices` : nom FR/EN, ville, province (liste fermée), fuseau (liste fermée), adresse facultative.<br>On **archive**, on ne supprime jamais. Les dossiers et l'historique restent rattachés. Le nom est unique (sans tenir compte de la casse).<br>Données de départ : **Moncton (N.-B., siège social, heure de l'Atlantique)**, Ottawa (ON, heure de l'Est), Halifax (N.-É., heure de l'Atlantique), Montréal (QC, heure de l'Est). Les adresses de Moncton, Halifax et Ottawa viennent de lexcanadalaw.com/contact ; Montréal attend son adresse. |
| 2 | Tribunaux | Table `public.courts` : nom FR/EN, compétence (province ou `FED`), fuseau. Le fuseau est obligatoire pour un tribunal provincial ; pour un tribunal fédéral, il suit l'audience.<br>Liste de départ de 16 tribunaux (N.-É., N.-B., Ontario, Québec, fédéral), **à valider par le cabinet**. Archivage seulement. |
| 3 | Personnel par bureau | Table `public.staff_offices` : un **bureau principal** au plus (index unique), plus d'autres bureaux.<br>La base refuse un client, une personne inactive et un bureau archivé.<br>L'enregistrement passe par `public.set_staff_offices`, **en une seule transaction**. Les rattachements à un bureau archivé sont conservés, et les lignes inchangées ne sont pas réécrites. |
| 4 | Bureau du dossier | Colonne `matters.office_id`. L'équipe du dossier ou le firm_admin la modifie, depuis l'onglet Informations ou depuis l'assistant d'ouverture.<br>Dans l'assistant, le choix par défaut est le bureau principal de l'avocat responsable. Un bureau archivé est refusé par la base. |
| 5 | **Aucun droit induit** | Le bureau sert à organiser, filtrer et (plus tard) placer dans le calendrier de cour. **L'accès aux dossiers reste celui de l'équipe** : un test pgTAP le prouve. Un rôle « responsable de bureau » reste une décision du cabinet. |
| 6 | Droits | Lecture : personnel. Écriture : firm_admin (page `/admin/offices`). Le client ne lit ni les bureaux, ni les tribunaux, ni les rattachements. Comme pour `matter_type_id`, la colonne `matters.office_id` de ses propres dossiers lui est techniquement lisible : il n'obtient qu'un identifiant, jamais le nom ni l'adresse du bureau. Le portail ne l'affiche pas. |
| 7 | Journal | Les triggers écrivent `office.created`, `office.updated`, `office.archived`, `office.restored`, `court.*`, `office.staff_insert`, `office.staff_update`, `office.staff_delete` et `matter.office_set`, avec des identifiants seulement. |
| 8 | Filtres | Le filtre « Bureau » est ajouté au portefeuille, au tableau par étape, aux vues enregistrées et aux demandes de documents. |

## Conséquences
- **Migrations** : `20261015120000_offices_courts.sql`, `20261016120000_office_moncton.sql` (siège de Moncton, adresses, tribunaux du N.-B.), puis `20261015120100_offices_hardening.sql` (transaction unique, personnel actif seulement, bureau actif aussi à la création d'un dossier), après la revue de sécurité.
- **Tests** :
  - pgTAP `20_bureaux_tribunaux` (22 tests) ;
  - e2e `offices.spec.ts`, sur ordinateur et à 375 px, avec axe : création, doublon, archivage, tribunal, bureau principal, bureau d'un dossier, filtre, version FR, page refusée au personnel.
- **Le Québec entre dans le périmètre** (Montréal) : Loi 25, tribunaux et jours fériés du Québec. Voir `docs/open-questions.md`.
