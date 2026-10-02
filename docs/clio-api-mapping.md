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
| Calendrier, rendez-vous, échéances | Clio Manage | Calendar Entries / Activities | Lecture | `GET .../api/v4/calendar_entries.json` | Calendars | À valider (catalogue exact des événements webhook du compte) | Partiellement disponible | Synchronisation périodique de secours |
| Facturation, factures, soldes | Clio Manage | Bills | Lecture | `GET .../api/v4/bills.json` | Billing | À valider | Confirmé pour la lecture | Synchronisation périodique |
| Paiement en ligne | Clio Payments | Payment Links (endpoints de création de liens de paiement mentionnés dans le changelog officiel, sous permissions « Clio Payments » et « Accounting ») | Écriture (création de lien) | À confirmer précisément dans la référence API du compte canadien | Clio Payments + Accounting | À valider | Partiellement disponible — Clio Payments est confirmé disponible pour les comptes canadiens (paiement carte et débit), l'endpoint précis de génération de lien doit être vérifié avec un compte développeur actif | Lien de paiement fourni par le cabinet, ou intégration Stripe, en secours |
| Documents (métadonnées, dépôt) | Clio Manage | Documents | Lecture/Écriture (upload possible via API selon la doc communautaire, à reconfirmer sur le compte réel) | `.../api/v4/documents.json` | Documents | Oui (modèle `document`) | Partiellement disponible | Utiliser SharePoint comme dépôt si confirmé par le cabinet (recommandation du mémorandum EA), Clio Documents en option alternative |
| Messagerie / communications | Clio Manage (Clio for Clients) | Communications | Le produit « Clio for Clients » est un portail natif complet (messages, documents, factures) ; **son exposition en écriture par l'API publique n'a pas été confirmée** dans les extraits de documentation consultés | À valider avec Clio | Non confirmé | **À valider avec Clio** | Trois options à arbitrer : (a) intégration officielle si confirmée, (b) messagerie propre au portail dans Supabase, (c) redirection sécurisée vers Clio for Clients |
| Signature électronique | Aucun produit natif confirmé dans Clio | — | — | — | — | — | Non disponible dans Clio | DocuSign comme premier fournisseur, derrière `SignatureProvider` |
| Activités / temps facturable (contexte du dossier) | Clio Manage | Activities | Lecture | `.../api/v4/activities.json` | Activities | Oui | Confirmé | — |
| Prospects / intake (hors périmètre client actif) | Clio Grow | Contacts (Grow) | Lecture/Écriture | Portail développeur Grow distinct | Scopes Grow | Custom Actions disponibles (Activities, Contacts, Documents, Matters concernés par ce mécanisme) | Confirmé (hors périmètre du portail client) | N/A |

## 2 bis. Utilisation dans le code (ADR 0014)
`server/providers/clio/` : lecture de contacts, matters et bills uniquement. Les listes de champs (`fields=`) sont dans `schemas.ts`, **à revérifier** sur le compte développeur du cabinet.

## 3. Points explicitement non confirmés (« à valider »)

- Disponibilité et permissions exactes de l'endpoint de création de lien de paiement Clio Payments pour un compte canadien.
- Exposition en écriture de l'API Communications/messagerie de Clio for Clients.
- Catalogue exact des types d'événements webhook disponibles pour `bill`, `calendar_entry`, `document` sur un compte de la région Canada.
- Upload de documents par API (la documentation communautaire l'évoque pour d'autres ressources, mais doit être revérifié directement dans la référence API du compte de développement Lex Canada).

## Sources et niveau de confirmation

Toutes les lignes « Confirmé par la documentation » ci-dessus proviennent de `docs.developers.clio.com` (API Reference, Rate Limits, Authorization, Fields, Permissions) et de `help.clio.com` (Clio Payments, Clio for Clients) consultés lors de cette phase. Les lignes « À valider » nécessitent un accès à un compte développeur Clio actif en région Canada pour confirmation directe dans la référence API interactive — cet accès n'existe pas encore (voir `technical-access-requirements.md`).
