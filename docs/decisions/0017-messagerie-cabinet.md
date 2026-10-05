# ADR 0017 — Messagerie du cabinet et avis de nouveau message (J7)

- **Statut** : accepté (2026-10-06)
- **Contexte** : un client pouvait écrire au cabinet, mais personne au cabinet ne pouvait lui répondre dans le portail. Dans la base, le personnel de l'équipe d'un dossier **voit** les fils, mais il ne peut **ni lire ni écrire** les messages tant qu'il n'en est pas participant. Côté application, `assertMatterAccess(…, "read_write")` ne reconnaissait que l'accès client.

## Décision

| # | Sujet | Décision |
|---|---|---|
| 1 | Droits effectifs | `public.matter_permissions(p_matter)` : **security invoker**, elle appelle `private.can_read_matter` et `private.can_write_matter` ; NULL est ramené à false. C'est la source unique de `assertMatterAccess` et `canWriteMatter`, pour le client, l'équipe du dossier et le firm_admin, avec les mêmes règles que la RLS. |
| 2 | Rejoindre un fil | `public.join_conversation(p_conversation)` (security definer) : seuls un membre de l'**équipe du dossier** ou un firm_admin peuvent s'inscrire comme participant. Un client ou un membre du personnel hors équipe reçoit false, ce qui donne une 404 à l'écran. |
| 3 | Espace cabinet | `/admin/messages` (filtres « Non lus » et « Tous », pastille de non-lus, « Nouveau message » qui inclut tous les clients ayant un accès actif au dossier) et `/admin/messages/[id]` (rejoindre à l'ouverture, répondre, « Clore »). Audit : `message.sent`, `conversation.closed`. Le contenu n'est jamais journalisé. |
| 4 | Avis de nouveau message | `message-notifier` (service_role, usage permis : notifications).<ul><li>**Notification** `new_message` dans le portail pour chaque client participant, dans sa langue.</li><li>**E-mail d'avis** bilingue, **sans aucun contenu**, avec un lien vers le portail, si la préférence e-mail est active. **Au plus 1 e-mail par fil et par destinataire toutes les 15 min.**</li><li>Quand un **client** écrit, l'équipe du dossier reçoit un e-mail d'avis.</li></ul>Un échec d'envoi n'annule jamais le message ; il est journalisé avec un code, sans donnée personnelle. |
| 5 | Correctif (bogue #49) | Créer un fil en demandant son identifiant en retour échouait : la RLS vérifie la visibilité du fil **avant** que le trigger n'inscrive l'auteur comme participant. L'application génère donc l'identifiant (UUID) et insère sans retour ; `grant insert (id)` sur `conversations`. |

## Conséquences
- Pièces jointes aux messages : reportées, elles dépendent de SharePoint et de l'antivirus (Phase 3).
- Notifications du personnel dans l'interface (cloche côté cabinet) : non prévues ; il est averti par e-mail et par la pastille de non-lus.
- Tests :
  - pgTAP `14_messagerie_cabinet` ;
  - intégration `staff-messaging.test.ts` (lecture et réponse de l'équipe, notification, e-mail sans contenu, limite de 15 min, hors équipe refusé, lecture seule) ;
  - e2e : le parcours cabinet → client avec axe, et la régression du bogue #49.

## Correctifs de la revue de sécurité (2026-10-04)
- **Avis revérifiés à chaque envoi** : être participant d'un fil ne suffit plus. Un client n'est averti (notification et e-mail) que s'il a encore un accès **non révoqué** au dossier ; un membre du personnel, que s'il est encore dans l'équipe du dossier, ou firm_admin. Un fil sans dossier n'envoie aucun avis. Test d'intégration « accès retiré ».
- **Ordre du contrôle d'accès** : ouvrir un fil côté cabinet lit d'abord son dossier, appelle `assertMatterAccess`, puis rejoint le fil. Clore un fil exige `assertMatterAccess(…, "read_write")` avant la modification.
- **Audit** : une nouvelle inscription à un fil est journalisée `conversation.joined`.
- **Portail** : les actions d'envoi du portail exigent une session client (`requireClientSession`).
- **Texte neutre** : la notification dit « Nouveau message au sujet du dossier … », car l'auteur peut être un autre client.
- **pgTAP** : un membre de l'équipe connecté par mot de passe n'a aucun droit et ne peut pas rejoindre ; le firm_admin peut lire, écrire et rejoindre hors équipe.
- **Reporté** : la création d'un fil par le cabinet n'est pas faite en une seule opération ; si une étape échoue, un fil vide peut rester (sans risque d'accès).
