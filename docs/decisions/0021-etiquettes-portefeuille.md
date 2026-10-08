# ADR 0021 — Étiquettes et portefeuille des dossiers

- **Statut** : accepté (2026-10-08). Demande du responsable : suivre les dossiers « par étiquette, mieux que Clio ».
- **Contexte** : la liste des dossiers n'offrait ni filtre, ni étiquette, ni alerte.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Étiquettes | `matter_tags` (migration `20261008130000`) : nom bilingue, couleur prise dans une palette fermée de 8 couleurs (contraste AA), interne ou **visible par le client**, actives ou non. Gérées par le firm_admin dans « Modèles de dossiers ». Six étiquettes de départ, que le cabinet ajuste. |
| 2 | Pose | `matter_tag_links` : l'équipe du dossier ou le firm_admin pose les étiquettes dans l'onglet « Informations du dossier ». L'auteur est imposé par la base. Pose et retrait sont journalisés (`matter_tag.added` et `removed`), et un changement de visibilité d'une étiquette est signalé (`matter_template.field_visibility`). |
| 3 | Client | Le client voit **seulement** les étiquettes marquées visibles, sur ses dossiers. RLS sans récursion : deux fonctions de contrôle en security definer (`tag_is_visible`, `client_sees_tag`), qui ne renvoient qu'un booléen. |
| 4 | Portefeuille | `/admin/matters` : filtres combinés (recherche, étiquette, type, avocat, statut, alerte « documents en retard » ou « inactifs depuis 14 jours »). Chaque ligne affiche le type, les étiquettes, l'avancement, les documents en attente ou en retard, et la dernière activité. Lectures avec la session (RLS). |

## Conséquences
- **À venir** : vues enregistrées, Kanban par étapes, panneau « À surveiller », demandes de documents globales et groupées (plan, phase 2).
- **Tests** : pgTAP `18_etiquettes` (14 cas) ; e2e `tags.spec.ts` (pose, filtre, client qui ne voit que l'étiquette visible, axe).
