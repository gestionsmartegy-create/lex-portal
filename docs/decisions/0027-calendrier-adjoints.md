# ADR 0027 — Accès des adjoint·e·s à tout le calendrier de cour

- **Statut** : accepté (2026-10-16).
- **Décision du cabinet** : courriel de la direction du 2026-10-16, sur demande de Me Saintelmy : « tous les adjoints devront avoir accès au calendrier ». Le même jour, le responsable du projet (Smartegy) précise dans la conversation de développement : **tout le cabinet**, tous bureaux confondus. Le courriel est conservé par le cabinet.
- **Contexte** : avant cette décision, le personnel ne voyait que les dates de cour des dossiers de ses équipes. Seul le firm_admin avait la vue générale (ADR 0026). La plateforme n'a pas de rôle « adjoint » : le rôle d'adjoint n'existe que dans l'équipe d'un dossier.

## Décision
| # | Sujet | Décision |
|---|---|---|
| 1 | Désignation | Le firm_admin désigne les adjoint·e·s dans « Bureaux et tribunaux » (table `public.court_calendar_viewers`). Seul le personnel actif peut être désigné. La désignation et son retrait sont journalisés. |
| 2 | Ce qu'il voit | Toutes les dates de cour du cabinet, dans le calendrier et sur l'accueil : sorte, date, heure, tribunal, salle, **numéro** du dossier, bureau, statut, conflits. Le **titre** du dossier (souvent le nom du client) n'est montré que pour les dossiers de ses équipes : c'est la minimisation recommandée par la revue de sécurité, à cause de la Loi 25 pour Montréal. |
| 3 | Ce qu'il ne voit pas | Pour un dossier hors de ses équipes : **ni notes internes, ni lien d'audience virtuelle, ni consignes au client, ni juge, ni n° de greffe**. Il ne peut ni ouvrir le dossier ni modifier la date. |
| 4 | Mise en œuvre | La lecture du calendrier passe par `public.court_calendar_feed(début, fin)` (security definer). Elle renvoie des colonnes limitées, sur une période de 62 jours au plus et 500 lignes au plus. Elle indique `on_team` pour afficher ou non le lien vers le dossier.<br>**La RLS de `court_dates` et de `matters` est inchangée.** |

## Conséquences
- **Migration** : `20261017120000_court_calendar_assistants.sql`.
- **Tests** :
  - pgTAP `22_calendrier_adjoints` (20 tests) :
    - accès : non désigné, désigné, client, connexion par mot de passe, anonyme ;
    - désignation : retrait par le firm_admin seulement (journalisé), personne inactive refusée ;
    - minimisation : titre masqué hors équipe ;
    - limites : période trop longue, aucune lecture directe, aucune modification ;
  - e2e : l'adjoint·e voit tout en lecture seule ; la désignation et le retrait se font par le firm_admin.
- Les conflits d'horaire d'un·e adjoint·e désigné·e sont calculés sur tout le cabinet.
- **Départ d'un employé** : retirer sa désignation. Elle reste de toute façon sans effet dès que le compte n'est plus actif.
- **Écrans de conflit (murailles)** : la plateforme n'en gère pas. Si le cabinet en met en place, il faudra exclure ces dossiers du calendrier des adjoint·e·s.
