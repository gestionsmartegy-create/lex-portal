# ADR 0031 — Connexion des agendas Outlook et retour depuis Clio

- **Statut** : accepté (2026-10-17). C'est le lot 4 du plan « bureaux et calendrier de cour » (stories E14, E15 et E16).
- **Contexte** :
  - les avocats ont des rendez-vous dans Outlook que le calendrier de cour ignore : un conflit d'horaire peut passer inaperçu ;
  - les dates de cour saisies dans la plateforme sont écrites dans Clio (ADR 0025), et Clio les recopie déjà dans Outlook ;
  - quelqu'un peut ensuite les modifier ou les supprimer directement dans Clio ;
  - le cabinet n'a pas encore enregistré d'application Microsoft (Azure) : le vrai Outlook n'est pas accessible.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Page | `/admin/my-calendar` (« Mon agenda »), pour tout le personnel : connecter, synchroniser, activer les rappels, déconnecter. |
| 2 | Ce qui est lu | **Plages occupées seulement** (début et fin), sur 1 jour passé et 60 jours à venir. Jamais le titre, le lieu, les participants ni le contenu. Elles sont stockées dans `private.calendar_busy_blocks` et ne sortent de la base que sous forme de « cette date de cour est en conflit » (`court_date_busy_conflicts`). |
| 3 | Conflits | Une date de cour active, dont un avocat présent est occupé dans Outlook, est en conflit, avec le libellé « Occupé dans Outlook ». Une plage identique à l'audience (à 2 minutes près) est ignorée : c'est l'audience elle-même, recopiée dans Outlook par Clio. |
| 4 | Rappels | Sur option : un rappel de 30 minutes à J-7 et à J-1, dans un agenda séparé « Lex Portail ». Il est affiché « disponible », ne compte donc pas comme occupé et ne crée pas de conflit. Le titre indique la sorte de date et le numéro du dossier, **jamais le nom du client**. Les rappels sont déplacés si la date bouge, et retirés si elle est annulée, si la personne n'est plus présente ou si les rappels sont désactivés. Les dates de cour elles-mêmes **ne sont pas** recopiées dans Outlook, puisque Clio le fait déjà. |
| 5 | Jetons | Supabase Vault (ADR 0014), par personne (`calendar:<uuid>`). Le simulateur n'en a pas. Les fonctions qui lisent ou écrivent les connexions sont réservées à `service_role`. La personne et le firm_admin ne voient que l'**état**. |
| 6 | Contrôle (revue de sécurité) | La personne se déconnecte. Le firm_admin voit toutes les connexions (Intégrations) et peut en **couper** une. Un compte **suspendu, désactivé ou devenu client** est déconnecté automatiquement, par un trigger sur `profiles`. Chaque déconnexion supprime le jeton du coffre, les plages occupées et les rappels connus, et est journalisée (`calendar.disconnected`, avec le motif `self`, `admin` ou `deactivated`). La connexion (`calendar.connected`) et le choix des rappels (`calendar.reminders_set`) sont aussi journalisés. |
| 7 | Simulateur | `INTEGRATION_MODE_OUTLOOK=mock` (défaut) : agenda fictif et stable par personne, avec le badge « Données de démonstration ». En mode `live`, la fonctionnalité **échoue** plutôt que de retomber sur le simulateur : l'implémentation Microsoft Graph sera écrite quand le cabinet aura suivi `docs/outlook-integration.md`. Une connexion du simulateur devient « à reconnecter » quand le mode change. |
| 8 | Retour Clio (E16) | Le planificateur relit dans Clio chaque date **déjà synchronisée** et à venir, au plus 60 par passage, avec `GET /calendar_entries/{id}.json`, champs `start_at`, `end_at` et `all_day`. Une **heure différente** remet la date à « à confirmer », avec la nouvelle heure. Une **entrée introuvable** (supprimée, ou un droit retiré) remet la date à « à confirmer » avec le signalement « Introuvable dans Clio » : elle n'est **jamais annulée automatiquement**, car une date annulée ne se rouvre pas et un 404 peut avoir une autre cause. L'équipe confirme (une nouvelle entrée est écrite dans Clio) ou annule. Si plus de 5 entrées sont introuvables dans un même passage, rien n'est appliqué et l'événement est journalisé (panne probable). Le signalement (`clio_change`) apparaît 14 jours dans « À surveiller » et sur le calendrier. Il disparaît quand l'équipe confirme, déplace ou clôt la date. Une journée entière n'est pas comparée à l'heure près. Seule la base écrit le changement (`court_date_apply_clio_change`, service_role), avec un audit `court_date.clio_changed`. |
| 9 | Hors périmètre | **Importer les dates de cour saisies directement dans Clio** (celles que la plateforme n'a pas créées) demande une règle pour reconnaître une audience parmi tous les rendez-vous Clio. C'est une décision du cabinet, ajoutée à `docs/open-questions.md`. |

## Conséquences
- **Migration `20261019120000_calendar_connections.sql`** :
  - tables `private.calendar_connections`, `calendar_busy_blocks` et `calendar_reminder_events` ;
  - fonctions de l'utilisateur, avec les droits vérifiés dans la fonction ;
  - fonctions du serveur (service_role) ;
  - trigger de déconnexion automatique ;
  - colonnes `court_dates.clio_change` et `clio_changed_at` ;
  - `court_calendar_feed` recréée.
- **Tests** :
  - pgTAP `24_agendas.test.sql` (30 tests) ;
  - unitaires `outlook-calendar.test.ts` ;
  - intégration `calendar-connections.test.ts`, avec de vraies sessions ;
  - e2e `my-calendar.spec.ts`, sur ordinateur et à 375 px, avec axe.
- **Revue de sécurité** :
  - un profil supprimé ne laisse pas de jeton dans le coffre (trigger) ;
  - « Connecter », « Synchroniser » et « Rappels » sont limités à 20 par personne et par 10 minutes.
- **Correction après QA** (migration `20261019120100_clio_change_keep_synced.sql`) : après un changement venu de Clio, la date reste « synchronisée ». Rien n'est réécrit dans Clio (ni recréé) tant que l'équipe n'a pas confirmé ou annulé.
- **Planificateur** (`/api/cron/sync`) : retour Clio, puis agendas Outlook, après les écritures en attente et les rappels clients.
- **Clio** : `GET /calendar_entries/{id}.json` relève de la même ressource documentée que `PATCH` et `DELETE` (ADR 0025). Le format de réponse sera vérifié sur le compte de test Clio au premier passage du planificateur. En cas d'écart, aucune date n'est signalée par erreur : une réponse invalide est ignorée et journalisée (`INVALID_RESPONSE`).
- **Reste à faire pour le vrai Outlook** :
  - l'enregistrement de l'application par le cabinet ;
  - puis le client Graph (`client.ts`) ;
  - et la route de connexion OAuth (PKCE et `state`), sur le modèle de Clio.
