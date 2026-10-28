# Cartographie fonctionnalité ↔ API Clio — Phase 0

## 1. Généralités confirmées par la documentation officielle

| Élément | Détail | Statut |
|---|---|---|
| Régions | 4 régions de données distinctes : Australie (`au.app.clio.com`), **Canada (`ca.app.clio.com`)**, UE (`eu.app.clio.com`), US (`app.clio.com`). Portails développeurs distincts par région (`ca.developers.clio.com` pour le Canada) | Confirmé par la documentation |
| Authentification | OAuth 2.0, flux Authorization Code, redirection vers `/oauth/authorize` avec `response_type`, `client_id`, `redirect_uri`, `state` ; PKCE recommandé même avec secret client | Confirmé par la documentation |
| Rate limiting | Par jeton d'accès ; limite par défaut de 50 requêtes/minute en heures de pointe ; entêtes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` ; `Retry-After` sur 429 | Confirmé par la documentation |
| Pagination | 200 résultats par requête maximum pour les actions d'index, pagination automatique au-delà | Confirmé par la documentation |
| Webhooks | Système de webhooks disponible, abonnement par modèle de ressource, événements (`created`, etc.), signature via `shared_secret`, endpoint par région | Confirmé par la documentation |
| Permissions | Deux couches : permissions d'accès (scopes de l'application) et permissions utilisateur (rôles). Un accès insuffisant à une ressource associée entraîne une redaction des champs (`redacted: true`), pas un 403 systématique | Confirmé par la documentation |
| Deux systèmes distincts | Clio Manage (API v4, pratique établie) et Clio Grow / « Clio Platform » (API distincte, portail développeur séparé) — ne pas mélanger leurs ressources | Confirmé par la documentation |

## 2. Cartographie par fonctionnalité du portail

| Fonctionnalité portail | Produit Clio | Ressource API | Lecture/Écriture | Endpoint (région CA, à adapter) | Permissions | Webhook | Statut | Stratégie de fallback |
|---|---|---|---|---|---|---|---|---|
| Liste et détail des dossiers | Clio Manage | Matters | Lecture | `GET https://ca.app.clio.com/api/v4/matters.json` | Matters | Oui (modèle `matter`) | Confirmé | Cache Supabase + resynchronisation périodique |
| Contacts / clients associés | Clio Manage | Contacts | Lecture | `GET .../api/v4/contacts.json` | Contacts (soumis à « Contacts Visibility » si activé côté firme) | Oui (modèle `contact`) | Confirmé | — |
| Dates de cour (ADR 0025) | Clio Manage | Calendar Entries, Calendars | **Écriture** : création, modification, suppression ; lecture des calendriers où l'on peut écrire | `POST /api/v4/calendar_entries.json`, `PATCH` et `DELETE /api/v4/calendar_entries/{id}.json`, `GET /api/v4/calendars.json?writeable=true` | Calendars (lecture et écriture) | Documenté (vérifié le 2026-10-16) ; à confirmer sur le compte de test après activation de la permission | **Confirmé (documentation)** | Planificateur : nouvelle tentative des écritures en attente |
| Retour des dates de cour (ADR 0031) | Clio Manage | Calendar Entries | Lecture d'une entrée écrite par la plateforme (heure, journée entière) | `GET /api/v4/calendar_entries/{id}.json?fields=id,start_at,end_at,all_day` | Calendars (lecture) | Même ressource que l'écriture (ADR 0025) ; format de réponse à vérifier au premier passage sur le compte de test | **Confirmé (documentation)**, réponse invalide ignorée | Planificateur : au plus 60 dates par passage |
| Calendrier, rendez-vous, échéances | Clio Manage | Calendar Entries / Activities | Lecture | `GET .../api/v4/calendar_entries.json` | Calendars | À valider (catalogue exact des événements webhook du compte) | Partiellement disponible | Synchronisation périodique de secours |
| Facturation, factures, soldes | Clio Manage | Bills | Lecture | `GET .../api/v4/bills.json` | Billing | À valider | Confirmé pour la lecture | Synchronisation périodique |
| Paiement en ligne | Clio Payments | Payment Links (endpoints de création de liens de paiement mentionnés dans le changelog officiel, sous permissions « Clio Payments » et « Accounting ») | Écriture (création de lien) | À confirmer précisément dans la référence API du compte canadien | Clio Payments + Accounting | À valider | Partiellement disponible — Clio Payments est confirmé disponible pour les comptes canadiens (paiement carte et débit), l'endpoint précis de génération de lien doit être vérifié avec un compte développeur actif | Lien de paiement fourni par le cabinet, ou intégration Stripe, en secours |
| Documents (métadonnées, dépôt) | Clio Manage | Documents | Lecture/Écriture (upload possible via API selon la doc communautaire, à reconfirmer sur le compte réel) | `.../api/v4/documents.json` | Documents | Oui (modèle `document`) | Partiellement disponible | Utiliser SharePoint comme dépôt si confirmé par le cabinet (recommandation du mémorandum EA), Clio Documents en option alternative |
| Dépôt d'un document dans un dossier (ADR 0038) | Clio Manage | Documents | Écriture | 1) `POST /api/v4/documents.json?fields=id,latest_document_version{uuid,put_url,put_headers}` avec `data.name` et `data.parent{id,type:"Matter"\|"Folder"}` ; 2) `PUT` du fichier sur `put_url` (S3 signé, 10 min) avec `put_headers`, côté serveur ; 3) `PATCH /api/v4/documents/{id}.json` avec `uuid` et `fully_uploaded: true` | Documents (lecture et écriture) | `document` : created / updated / deleted | **Confirmé (documentation, openapi.json v4, vérifié le 2026-10-28)** ; à essayer sur le compte de test | Planificateur : nouvelle tentative |
| Nouvelle version d'un document | Clio Manage | Documents | Écriture | Même flux avec `parent{id:<document_id>, type:"Document"}` | Documents | `document` : updated | **Confirmé (documentation)** ; `422 UnversionableDocumentError` pour certains types | Nouveau document |
| Agenda d'un dossier (ADR 0038) | Clio Manage | Calendar Entries | Lecture | `GET /api/v4/calendar_entries.json?matter_id=…&owner_entries_across_all_users=true&updated_since=…&order=id(asc)&fields=id,summary,location,start_at,end_at,all_day,updated_at,calendar_entry_event_type{name}` | Calendars (lecture) | `calendar_entry` : created / updated / deleted | **Confirmé (documentation, vérifié le 2026-10-28)** | Relecture périodique avec `updated_since` |
| Webhooks documents et agenda | Clio Manage | Webhooks | Abonnement | `POST /api/v4/webhooks.json` (`model`, `events`, `fields`, `url` https) ; poignée de main `X-Hook-Secret` ; signature `X-Hook-Signature` (HMAC-SHA256 du corps) ; expiration de 3 à 31 jours | Scope du modèle + Webhooks | — | **Confirmé (documentation)** ; non utilisé pour l'instant | Planificateur |
| Messagerie / communications | Clio Manage (Clio for Clients) | Communications | Le produit « Clio for Clients » est un portail natif complet (messages, documents, factures) ; **son exposition en écriture par l'API publique n'a pas été confirmée** dans les extraits de documentation consultés | À valider avec Clio | Non confirmé | **À valider avec Clio** | Trois options à arbitrer : (a) intégration officielle si confirmée, (b) messagerie propre au portail dans Supabase, (c) redirection sécurisée vers Clio for Clients |
| Signature électronique | Aucun produit natif confirmé dans Clio | — | — | — | — | — | Non disponible dans Clio | DocuSign comme premier fournisseur, derrière `SignatureProvider` |
| Activités / temps facturable (contexte du dossier) | Clio Manage | Activities | Lecture | `.../api/v4/activities.json` | Activities | Oui | Confirmé | — |
| Prospects / intake (hors périmètre client actif) | Clio Grow | Contacts (Grow) | Lecture/Écriture | Portail développeur Grow distinct | Scopes Grow | Custom Actions disponibles (Activities, Contacts, Documents, Matters concernés par ce mécanisme) | Confirmé (hors périmètre du portail client) | N/A |

## 2 bis. Utilisation dans le code (ADR 0014)
`server/providers/clio/` : lecture de contacts, matters et bills uniquement. Les listes de champs (`fields=`) sont dans `schemas.ts`, **à revérifier** sur le compte développeur du cabinet.

## 3. Points explicitement non confirmés (« à valider »)

- Disponibilité et permissions exactes de l'endpoint de création de lien de paiement Clio Payments pour un compte canadien.
- Exposition en écriture de l'API Communications/messagerie de Clio for Clients.
- Catalogue exact des types d'événements webhook pour `bill` sur un compte de la région Canada (`calendar_entry` et `document` : created / updated / deleted, confirmés le 2026-10-28).
- Upload de documents par API : **confirmé par la documentation officielle le 2026-10-28** (ADR 0038) ; reste à l'essayer sur le compte de test (permission Documents en écriture).

## Sources et niveau de confirmation

Toutes les lignes « Confirmé par la documentation » ci-dessus proviennent de `docs.developers.clio.com` (API Reference, Rate Limits, Authorization, Fields, Permissions) et de `help.clio.com` (Clio Payments, Clio for Clients) consultés lors de cette phase. Les lignes « À valider » nécessitent un accès à un compte développeur Clio actif en région Canada pour confirmation directe dans la référence API interactive — cet accès n'existe pas encore (voir `technical-access-requirements.md`).
