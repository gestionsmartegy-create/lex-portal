# ADR 0012 — Expiration des sessions et procédure « téléphone perdu »

- **Statut** : accepté (2026-10-02)
- **Contexte** : questions ouvertes de l'ADR 0011, tranchées par le responsable du projet le 2026-10-02 :
  - 30 minutes d'inactivité, avec une fenêtre de fermeture et un compte à rebours ;
  - la procédure « téléphone perdu » est déléguée à l'équipe de développement ;
  - Supabase Pro en production.

## Décision

### Sessions

| # | Sujet | Décision |
|---|---|---|
| 1 | Qui décide | **La base**, par `public.touch_session()` (`security definer`, sans paramètre : session et utilisateur lus dans le JWT vérifié). Elle est appelée par `proxy.ts` à chaque page `/portal` ou `/admin` (Server Actions comprises) et par le signal d'activité. Le minuteur du navigateur n'est qu'une commodité. Un échec de la RPC est traité comme une expiration (échec fermé). |
| 2 | Seuils | Inactivité de **30 min** côté navigateur. Le serveur tranche à **32 min** : 2 min de marge, car le signal d'activité part au plus une fois par minute. Durée maximale de **12 h** : `touch_session`, et aussi `[auth.sessions] timebox` de GoTrue (plan Pro). |
| 3 | Avertissement | `SessionTimeoutGuard` (portail et espace cabinet) :<ul><li>**à 28 min**, fenêtre `alertdialog` avec un **compte à rebours de 2:00**. Le focus va sur « Rester connecté » ; la touche Échap est sans effet ; l'annonce aux lecteurs d'écran se fait au début puis à 30 s ;</li><li>une fois la fenêtre ouverte, **seul un clic** la ferme ;</li><li>activité **partagée entre onglets** (`BroadcastChannel`) ;</li><li>à 0, déconnexion de l'appareil, journalisée (`auth.session_timeout`), et des autres onglets.</li></ul> |
| 4 | Fin côté serveur | `proxy.ts` redirige en 303 vers `/api/auth/session-expired`. Cette route **reconsulte la base** avant de couper : un lien tiers ne peut donc pas déconnecter quelqu'un. Elle journalise, puis renvoie vers la page de connexion avec le message d'expiration. |
| 5 | Jeton d'accès | `jwt_expiry` passe de 1 h à **15 min**. Un jeton volé reste utilisable 15 min au plus après une déconnexion. |
| 6 | CSP | La fenêtre Radix injecte un `<style>` (verrouillage du défilement). Il reçoit le nonce **du document** (lu sur les scripts de Next.js, via `get-nonce`) : après une navigation côté client, la CSP reste celle du premier chargement. Aucun `unsafe-inline`. |

### Téléphone perdu (MFA des clients)

| # | Sujet | Décision |
|---|---|---|
| 7 | Libre-service | **Interdit.** Une réinitialisation par e-mail ramènerait la double authentification à la sécurité de la seule boîte de courriel. La page `/login/mfa/lost` donne uniquement la marche à suivre. |
| 8 | Qui | Un **firm_admin**, jamais un simple membre du personnel, jamais sur son propre compte, et seulement sur un compte **client**. La MFA du personnel relève de Microsoft Entra. |
| 9 | Vérification | **Rappel au numéro inscrit dans Clio** (jamais un numéro donné pendant l'appel) et **deux éléments** que seul le client connaît. Sinon, une rencontre en personne avec une pièce d'identité. Procédure détaillée : `docs/runbooks/mfa-reset.md`. |
| 10 | Effet | Dans l'ordre :<ol><li>suppression de tous les facteurs ;</li><li>révocation de toutes les sessions (`public.revoke_user_sessions`, service_role) ;</li><li>**mot de passe remplacé par une valeur aléatoire** jamais affichée : sinon, un tiers qui connaît l'ancien mot de passe pourrait se connecter avant le client et enrôler **son** téléphone ;</li><li>e-mail bilingue au client : information et lien de nouveau mot de passe, à usage unique, valable 1 h. Ce lien utilise un `token_hash`, sans PKCE, car la demande ne vient pas du navigateur du client ;</li><li>audit `auth.mfa_reset` : auteur, compte, méthode de vérification, motif.</li></ol>Ensuite, l'enrôlement MFA est imposé au client à sa première connexion. |
| 11 | Garde-fous | Limite de 5 réinitialisations par heure et par administrateur. La case « identité vérifiée » est obligatoire. Les réinitialisations se relisent dans l'audit. |

## Conséquences
- En production (plan Pro), `timebox = 12h` s'ajoute au contrôle de la base. L'inactivité reste imposée par `touch_session`, quel que soit le plan.
- Une écriture au plus par minute et par session active dans `private.session_activity`.
- Le lien de récupération (`token_hash`, type `recovery` uniquement) est accepté par `/api/auth/callback`, en plus de l'échange PKCE.
- J5 : la réinitialisation rejoindra la fiche client de l'espace cabinet, et l'audit sera consultable dans `/admin/audit`.
