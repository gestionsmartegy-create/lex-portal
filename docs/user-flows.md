# Flux utilisateurs — Portail Client Lex Canada

## 1. Invitation et activation d'un client

```mermaid
sequenceDiagram
  participant Admin as Administrateur cabinet
  participant Clio as Clio Manage
  participant Portail as Portail (Next.js)
  participant Supa as Supabase
  participant Client

  Admin->>Clio: Identifie le contact et le dossier (dans Clio Manage)
  Admin->>Portail: Crée une invitation (email, contact_id Clio, matter_id Clio)
  Portail->>Supa: Enregistre l'invitation (statut "pending")
  Portail->>Client: Envoie un e-mail d'invitation sécurisé (lien à usage unique, expirant)
  Client->>Portail: Ouvre le lien, crée son mot de passe / active MFA
  Portail->>Supa: Crée le compte, lie user_id ↔ external_contact_id ↔ matter_access
  Portail->>Admin: Confirme l'association (visible dans le journal d'audit)
```

**Hypothèse d'architecture :** l'association ne doit jamais reposer uniquement sur la correspondance d'adresse e-mail ; elle doit être initiée manuellement par un administrateur du cabinet à partir d'un contact Clio identifié, avec confirmation explicite par le client lors de l'activation (double facteur : lien à usage unique + vérification e-mail).

## 2. Authentification et accès à un dossier

```mermaid
sequenceDiagram
  participant Client
  participant Portail as Next.js (serveur)
  participant Supa as Supabase (RLS)
  participant Cache as matter_cache (Supabase)
  participant Clio

  Client->>Portail: Se connecte (Supabase Auth + MFA)
  Client->>Portail: Demande le détail du dossier X
  Portail->>Supa: Vérifie matter_access (RLS) pour user_id + matter_id X
  alt accès autorisé
    Portail->>Cache: Lit les données mises en cache (statut, dernière synchro)
    Portail->>Clio: Complète si nécessaire (lecture serveur uniquement, jamais depuis le navigateur)
    Portail-->>Client: Affiche le dossier
  else accès refusé
    Portail-->>Client: 403 — aucune donnée exposée
  end
```

## 3. Révocation d'accès

```mermaid
sequenceDiagram
  participant Admin
  participant Portail
  participant Supa

  Admin->>Portail: Révoque l'accès au dossier X pour le client Y
  Portail->>Supa: Met à jour matter_access.revoked_at (immédiat)
  Portail->>Supa: Invalide les sessions actives concernées
  Portail->>Supa: Journalise l'action dans audit_events
  Note over Supa: RLS empêche toute lecture dès la révocation, indépendamment du cache applicatif
```

## 4. Synchronisation périodique (dossiers, factures, calendrier)

```mermaid
sequenceDiagram
  participant Job as Tâche planifiée (worker)
  participant Clio
  participant Supa as Supabase (cache non-autoritaire)

  Job->>Clio: Requête paginée (matters, bills, calendar_entries) — respecte le rate limit (50 req/min par défaut)
  Clio-->>Job: Réponses (avec retries/backoff sur 429)
  Job->>Supa: Met à jour matter_cache / document_links / sync_jobs
  Note over Job,Supa: Les webhooks Clio (si abonnés) déclenchent une synchronisation ciblée en complément
```

## 5. Téléversement d'un document par un client

```mermaid
sequenceDiagram
  participant Client
  participant Portail
  participant AV as Analyse antivirus
  participant Store as SharePoint ou stockage documentaire officiel (à confirmer)

  Client->>Portail: Sélectionne un fichier (type MIME et taille validés côté client et serveur)
  Portail->>AV: Analyse antivirus avant stockage définitif
  AV-->>Portail: Fichier sain / rejeté
  Portail->>Store: Dépôt du fichier (identité applicative ou déléguée, à trancher — voir architecture.md)
  Portail->>Portail: Enregistre uniquement la référence (document_links), pas le contenu, dans Supabase
```

## Sources et niveau de confirmation

- Flux dérivés du cahier des charges (règles de RLS, révocation immédiate, non-copie du contenu documentaire).
- Rate limit (50 req/min, entêtes `X-RateLimit-*`, `Retry-After`) : confirmé par la documentation Clio.
- Pagination à 200 résultats par page : confirmé par la documentation Clio.
- Webhooks Clio Manage (signés par `shared_secret`, par modèle de ressource) : confirmés par la documentation Clio.
- Modèle d'identité SharePoint (applicative vs déléguée) : hypothèse d'architecture, à trancher en Phase 0 avec le cabinet — voir `architecture-evaluation.md` §12.
