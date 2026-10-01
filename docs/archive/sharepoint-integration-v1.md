# Intégration SharePoint / Microsoft Graph — Phase 0

## 1. Statut de la décision

Le mémorandum d'architecture fourni (VECTORIEL…PDF) recommande SharePoint Online comme dépôt documentaire officiel, avec iManage en phase future. **Ce n'est pas encore une décision confirmée par le cabinet** pour le portail client — c'est une recommandation d'architecture d'entreprise générale. À confirmer avant la Phase 3 du portail (voir `implementation-roadmap.md`).

## 2. Organisation proposée

- Un site ou une bibliothèque documentaire par cabinet (Lex Canada Law), avec une arborescence par dossier Clio (`clio_matter_id` en métadonnée de dossier SharePoint).
- Chaque dossier Clio est associé à un dossier/bibliothèque SharePoint via `document_links.sharepoint_drive_id` + `sharepoint_item_id` (référence uniquement, jamais de copie de contenu dans Supabase).

## 3. Modèles d'accès (rappel, détail dans `architecture-evaluation.md` §4)

| Modèle | Isolation entre clients | Recommandation |
|---|---|---|
| Identité applicative (app-only) | Portée entièrement par la logique applicative du portail | Retenu comme hypothèse de travail, sous réserve de validation |
| Identité déléguée | Portée en partie par les permissions SharePoint natives | Nécessiterait une identité Microsoft par client — hors périmètre actuel |

## 4. Permissions Microsoft Graph — principe du moindre privilège

| Permission Graph (indicative) | Usage | Lecture/Écriture séparées |
|---|---|---|
| `Sites.Selected` (accès limité au site documentaire de Lex Canada uniquement) | Lecture/écriture des documents du portail | Oui — application distincte ou scope distinct pour lecture (téléchargement) et écriture (téléversement) |
| `Files.ReadWrite` (limité par `Sites.Selected`) | Téléversement, téléchargement | — |

**À valider avec Microsoft / l'administrateur Microsoft 365 du cabinet :** le choix précis entre `Sites.Selected` (recommandé pour limiter la portée à un seul site) et des permissions plus larges.

## 5. Fonctionnement prévu

- **Téléchargement** : génération d'un lien temporaire signé (durée de vie courte), jamais un lien SharePoint permanent partagé directement avec le client.
- **Téléversement** : validation MIME et taille côté serveur avant écriture, analyse antivirus avant confirmation du dépôt.
- **Suppression** : jamais initiée directement par un client ; passe par une demande traitée par le cabinet.
- **Versions et métadonnées** : gérées nativement par SharePoint (politiques de rétention existantes), le portail n'affiche qu'un résumé (auteur, date, catégorie).
- **Abonnements Graph (webhooks)** : à utiliser pour détecter les nouveaux documents partagés avec un client, avec renouvellement automatique avant expiration (les abonnements Graph ont une durée de vie maximale et doivent être renouvelés — **à valider techniquement en Phase 1**).

## 6. Ce qui reste à confirmer avec le cabinet et Microsoft

- SharePoint est-il effectivement le dépôt retenu pour les documents partagés avec les clients, ou Clio Documents est-il préféré pour ce cas d'usage précis ?
- Existe-t-il déjà un site SharePoint dédié, ou faut-il le créer ?
- Qui détient l'autorité pour créer l'App Registration Azure nécessaire ?
- Quelle est la politique de rétention actuelle des documents clients dans SharePoint ?

## Sources et niveau de confirmation

- Recommandation SharePoint comme dépôt documentaire : confirmée comme **recommandation du mémorandum fourni**, pas comme fait technique vérifié par une documentation Microsoft consultée dans cette phase.
- Concepts génériques Microsoft Graph (`Sites.Selected`, permissions déléguées vs applicatives, abonnements avec expiration) : connaissances générales de la plateforme Microsoft Graph, **non re-vérifiées par une consultation officielle dans cette phase** — à confirmer explicitement en Phase 0 complémentaire ou en Phase 1 avant implémentation.
