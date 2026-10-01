# ADR 0004 — SharePoint, dépôt officiel des fichiers clients

**Statut :** Acceptée (décision du cabinet communiquée le 2026-10-01). Les modalités sont à confirmer (voir `sharepoint-integration.md` §8).
**Date :** 2026-10-01

## Contexte
`open-questions.md` laissait ouverte la question critique « SharePoint ou Clio Documents ». Le cabinet veut que la gestion des fichiers clients passe par SharePoint. C'est cohérent avec le mémorandum d'architecture d'entreprise (SharePoint Online, iManage en phase future).

## Décision
- SharePoint Online est la **source de vérité** des fichiers clients. Le portail ne stocke que des références (`public.documents`) et l'emplacement par dossier (`private.matter_storage_folders`).
- La **visibilité client est déterminée par le sous-dossier** (`01 Partagé avec le client`, `02 Déposé par le client`, `03 Signés`). Tout autre emplacement est interne et n'est pas synchronisé. La colonne `documents.shared_with_client` du schéma v2 est remplacée par `documents.folder` (enum `document_folder`), et la RLS refuse `internal`.
- Accès app-only via une App Registration dédiée, limitée par `Sites.Selected` au seul site des dossiers clients ; certificat dans le coffre-fort.
- Les fichiers ne sont jamais servis au client par une URL SharePoint ou pré-authentifiée : le serveur les transmet en flux après contrôle d'accès, et l'action est journalisée.
- Synchronisation par requête delta, déclenchée par des notifications Graph et un passage planifié de secours.

## Conséquences
- Ajouts au schéma : `private.matter_storage_folders`, `private.graph_delta_state`, `private.graph_subscriptions`, et `documents.folder` / `external_etag`. Validé par le scénario T32 (identifiants SharePoint inaccessibles aux clients).
- `DocumentStore` a pour implémentation réelle `SharePointDocumentStore`. `ClioDocumentStore` est retiré du périmètre, sauf décision contraire.
- La Phase 3 dépend d'actions de l'administrateur M365 (App Registration, attribution du site, certificat).
- Reste ouvert : antivirus (option A ou B), structure existante éventuelle dans Teams ou SharePoint, coexistence avec Clio Documents.
