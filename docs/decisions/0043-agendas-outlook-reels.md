# ADR 0043 — Agendas Outlook réels (Microsoft Graph)

- **Statut** : accepté (2026-11-10), décision du responsable du projet. Complète l'ADR 0031 (simulateur).
- **Contexte** : l'application Microsoft « Lex Portail — Agendas » est enregistrée dans le locataire du cabinet. Le simulateur peut donc être remplacé par le vrai Outlook, environnement par environnement.
- **Décision** :

| # | Sujet | Décision |
|---|---|---|
| 1 | Mode | `INTEGRATION_MODE_OUTLOOK=live` choisit `GraphOutlookCalendarGateway` ; `mock` reste la valeur par défaut. En `live`, `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID` et `OUTLOOK_CLIENT_SECRET` sont exigés au démarrage. |
| 2 | Connexion | OAuth 2.0 Authorization Code + PKCE, point d'accès du **locataire du cabinet** (jamais `common`), `prompt=select_account`. `state` et vérificateur dans un cookie HttpOnly de 10 min limité à `/api/integrations/outlook`. Les routes revérifient la session et le rôle (personnel) ; même 404 sinon. |
| 2 bis | Bon compte | L'adresse de la session est proposée à Microsoft (`login_hint`). Au retour, le compte Microsoft (`GET /me`) doit porter cette adresse : une boîte partagée ou le compte d'un collègue est refusé. Le retour doit aussi arriver dans la session qui a lancé la connexion, et il est soumis à la limite de débit de la synchronisation. |
| 3 | Permissions | Déléguées. À la connexion : `User.Read`, `offline_access`, `Calendars.ReadBasic`. `Calendars.ReadWrite` n'est demandée qu'à une personne qui active les rappels (retour chez Microsoft, puis activation). Aucune permission sur les courriels. |
| 4 | Ce qui est lu | `GET /me/calendarView` avec `$select=start,end,showAs,isCancelled` : jamais le titre, le lieu, les participants ni le contenu. Seules les plages « occupé » et « absent » comptent ; les événements annulés, libres ou provisoires sont ignorés. |
| 5 | Ce qui est écrit | Rappels dans l'agenda « Lex Portail » (retrouvé par son nom avant d'être créé), affichés « disponible », sans participant ni corps. Un rappel supprimé à la main est recréé. |
| 6 | Jetons | Par personne, dans Supabase Vault. Le renouvellement passe par `public.calendar_update_tokens()` (service_role seulement), qui ne touche ni à la date de connexion ni au journal. Un jeton refusé par Microsoft met la connexion « À reconnecter ». |
| 7 | Sécurité | Le jeton n'est envoyé qu'à `https://graph.microsoft.com/v1.0/` (lien de page suivante compris) ; aucune redirection suivie ; délai de 15 s ; erreurs traduites en codes internes, jamais la réponse de Microsoft ; aucun jeton dans un log, une URL ou une réponse. |

- **Conséquences** :
  - Migration `20261110120000_calendar_token_refresh.sql` (une fonction, aucune table) et test pgTAP `31_agendas_jetons.test.sql`.
  - Tests unitaires `tests/unit/outlook-client.test.ts` avec de fausses réponses de Microsoft.
  - `docs/outlook-integration.md` §8 : points d'accès passés à « Confirmé (documentation) ».
  - **Non vérifié** tant que le premier essai réel n'a pas eu lieu sur le locataire du cabinet.
  - Cette connexion signale les conflits avec les audiences. Elle ne bloque pas les créneaux de Clio Scheduler : c'est le rôle de la synchronisation Outlook de Clio.
