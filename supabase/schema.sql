-- ============================================================================
-- LEX CANADA LAW — PORTAIL CLIENT — SCHÉMA SUPABASE v2.0
-- ============================================================================
-- Remplace docs/archive/schema-v1.sql. Écarts justifiés dans
-- docs/decisions/0003-schema-v2.md. Documentation : docs/database.md.
--
-- Organisation en 3 schémas :
--   public   exposé à l'API (PostgREST). RLS sur TOUTES les tables, sans exception.
--   private  NON exposé. Fonctions d'aide RLS, intégrations, synchro, webhooks.
--   audit    NON exposé. Journal append-only (aucun UPDATE/DELETE possible).
--
-- Principes :
--   - Supabase n'est JAMAIS la source de vérité d'une donnée Clio/SharePoint :
--     tables *cache* marquées par last_synced_at.
--   - Aucun jeton OAuth, aucune donnée bancaire, aucun contenu de document ici.
--   - Les droits se vérifient à CHAQUE requête (RLS) : une révocation est donc
--     effective immédiatement, même avec une session encore valide.
--   - Les clients doivent avoir une session MFA (aal2) pour lire un dossier.
--     Le personnel s'authentifie par Entra ID (MFA imposé côté Microsoft).
-- ============================================================================

create schema if not exists private;
create schema if not exists audit;

revoke all on schema private from public;
revoke all on schema audit   from public;
-- Les politiques RLS appellent les fonctions private.* : il faut l'usage du
-- schéma, mais AUCUN droit sur ses tables.
grant usage on schema private to authenticated, service_role;
grant usage on schema audit   to service_role;

-- ----------------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ----------------------------------------------------------------------------
create type public.app_role              as enum ('client', 'staff', 'firm_admin');
create type public.user_status           as enum ('invited', 'active', 'suspended', 'deactivated');
create type public.org_type              as enum ('client_organization', 'partner');
create type public.org_member_role       as enum ('owner', 'member');
create type public.access_level          as enum ('read', 'read_write');
create type public.matter_status         as enum ('open', 'action_required', 'on_hold', 'closed');
create type public.team_role             as enum ('responsible', 'originating', 'collaborator', 'assistant');
create type public.appointment_status    as enum ('scheduled', 'completed', 'cancelled');
create type public.document_provider     as enum ('sharepoint', 'clio', 'supabase_storage', 'imanage');
create type public.document_status       as enum ('uploaded', 'in_review', 'accepted', 'rejected', 'pending_signature', 'signed');
create type public.scan_status           as enum ('pending', 'clean', 'infected', 'failed', 'not_required');
-- Sous-dossier SharePoint d'origine (voir docs/sharepoint-integration.md §3) :
-- la visibilité client découle du dossier, pas d'une saisie manuelle.
create type public.document_folder       as enum ('shared', 'client_upload', 'signed', 'internal');
create type public.request_status        as enum ('pending', 'fulfilled', 'overdue', 'cancelled');
create type public.conversation_scope    as enum ('matter', 'general');
create type public.invoice_status        as enum ('due', 'overdue', 'paid', 'void');
create type public.payment_status        as enum ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled');
create type public.signature_status      as enum ('to_sign', 'sent', 'viewed', 'signed', 'declined', 'expired');
create type public.notification_type     as enum (
  'document_requested', 'document_received', 'new_document', 'new_message',
  'appointment_scheduled', 'appointment_reminder', 'matter_status_changed',
  'matter_completed', 'invoice_issued', 'payment_received',
  'signature_required', 'security_alert'
);
create type public.notification_priority as enum ('urgent', 'info', 'success');
create type public.invitation_status     as enum ('pending', 'accepted', 'expired', 'revoked');

create type private.integration_provider as enum (
  'clio_manage', 'clio_grow', 'microsoft_graph', 'docusign',
  'stripe', 'clio_payments', 'power_automate'   -- power_automate : anticipé, non implémenté
);
create type private.integration_status   as enum ('not_configured', 'connected', 'error', 'revoked');
create type private.sync_resource_type   as enum ('matter', 'contact', 'bill', 'calendar_entry', 'document', 'activity');
create type private.sync_status          as enum ('queued', 'running', 'succeeded', 'failed', 'dead');
create type private.webhook_status       as enum ('received', 'rejected', 'processed', 'failed');

-- ----------------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES
-- ----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 3. IDENTITÉ
-- ----------------------------------------------------------------------------

-- Domaines autorisés pour le personnel (défense en profondeur avec la
-- restriction de tenant Entra ID).
create table private.staff_email_domains (
  domain     text primary key check (domain = lower(domain)),
  created_at timestamptz not null default now()
);
insert into private.staff_email_domains (domain) values ('lexcanadalaw.com');

-- 1:1 avec auth.users. Créé automatiquement par private.handle_new_user().
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  first_name         text,
  last_name          text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'fr')),
  phone              text,
  role               public.app_role    not null default 'client',
  status             public.user_status not null default 'invited',
  client_number      text unique,              -- ex. « 2026-0142 » affiché dans la barre latérale
  title              text,                     -- personnel : « Me », « Avocate associée »…
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

-- Clients personnes morales (une entreprise, plusieurs contacts).
create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            public.org_type not null default 'client_organization',
  clio_contact_id text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  role            public.org_member_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Correspondance utilisateur portail <-> identité externe (contact Clio, objet Entra ID).
create table public.external_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  provider        text not null check (provider in ('clio_manage', 'entra_id')),
  external_id     text not null,
  external_region text,                         -- 'ca' pour Clio
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique (provider, external_id),
  unique (user_id, provider)
);

-- ----------------------------------------------------------------------------
-- 4. DOSSIERS, ÉQUIPE, ACCÈS
-- ----------------------------------------------------------------------------

-- Registre des dossiers + cache d'affichage Clio. Une ligne n'est JAMAIS
-- supprimée (l'historique d'accès et l'audit en dépendent) : la purge après
-- clôture efface les champs descriptifs et renseigne purged_at.
create table public.matters (
  id                    uuid primary key default gen_random_uuid(),
  clio_matter_id        text unique,             -- null = dossier fictif (is_mock) ou saisi manuellement
  display_number        text unique,             -- ex. « LC-2026-0142 »
  title                 text not null,
  description           text,
  practice_area         text,                    -- ex. « Immigration »
  status                public.matter_status not null default 'open',
  progress_percent      smallint check (progress_percent between 0 and 100),
  responsible_staff_id  uuid references public.profiles(id) on delete set null,
  responsible_name      text,                    -- dénormalisé depuis Clio (« Me Wilson Saintelmy »)
  opened_at             date,
  closed_at             date,
  is_mock               boolean not null default false,
  last_synced_at        timestamptz,
  purged_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (is_mock or clio_matter_id is not null or last_synced_at is null)
);
create index matters_status_idx on public.matters (status);

-- Personnel affecté à un dossier (moindre privilège : un membre du personnel
-- ne voit que les dossiers de son équipe ; firm_admin voit tout).
create table public.matter_team (
  matter_id  uuid not null references public.matters(id)  on delete restrict,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.team_role not null default 'collaborator',
  created_at timestamptz not null default now(),
  primary key (matter_id, user_id)
);
create index matter_team_user_idx on public.matter_team (user_id);

-- TABLE CENTRALE DE SÉCURITÉ : droit d'un client sur un dossier.
-- Jamais supprimée : on révoque (revoked_at). Un nouvel octroi après
-- révocation crée une nouvelle ligne (historique complet).
create table public.matter_access (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references public.matters(id)  on delete restrict,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  access_level  public.access_level not null default 'read',
  granted_by    uuid references public.profiles(id) on delete set null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  check (revoked_at is null or revoked_at >= granted_at)
);
create unique index matter_access_one_active_key
  on public.matter_access (matter_id, user_id) where revoked_at is null;
create index matter_access_user_active_idx
  on public.matter_access (user_id, matter_id) where revoked_at is null;

-- Chronologie orientée client (n'existe pas nativement dans Clio : saisie
-- par le cabinet ou dérivée d'activités Clio — à valider).
create table public.matter_timeline_steps (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references public.matters(id) on delete cascade,
  position     smallint not null,
  title        text not null,
  description  text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (matter_id, position),
  check (not is_completed or completed_at is not null)
);

-- ----------------------------------------------------------------------------
-- 5. RENDEZ-VOUS (cache — source de vérité : Clio Calendar Entries)
-- ----------------------------------------------------------------------------
create table public.appointments (
  id                     uuid primary key default gen_random_uuid(),
  clio_calendar_entry_id text unique,
  matter_id              uuid not null references public.matters(id) on delete cascade,
  title                  text not null,
  description            text,
  starts_at              timestamptz not null,
  ends_at                timestamptz,
  timezone               text not null default 'America/Halifax',
  location               text,
  meeting_url            text,
  with_staff_name        text,
  status                 public.appointment_status not null default 'scheduled',
  last_synced_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index appointments_matter_starts_idx on public.appointments (matter_id, starts_at);

-- ----------------------------------------------------------------------------
-- 6. DOCUMENTS (références uniquement — contenu chez SharePoint/Clio)
-- ----------------------------------------------------------------------------
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references public.matters(id) on delete cascade,
  provider          public.document_provider not null,
  external_drive_id text,                       -- SharePoint driveId
  external_item_id  text,                       -- SharePoint itemId / Clio document id
  external_etag     text,                       -- eTag SharePoint : détecte les nouvelles versions
  folder            public.document_folder not null default 'shared',
  storage_path      text,                       -- quarantaine Supabase Storage avant antivirus
  display_name      text not null,
  category          text,
  status            public.document_status not null default 'uploaded',
  scan_status       public.scan_status     not null default 'pending',
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by       uuid references public.profiles(id) on delete set null,
  uploaded_at       timestamptz not null default now(),
  deleted_at        timestamptz,                -- suppression logique, initiée par le cabinet uniquement
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, external_drive_id, external_item_id)
);
create index documents_matter_idx on public.documents (matter_id) where deleted_at is null;

create table public.document_requests (
  id                    uuid primary key default gen_random_uuid(),
  matter_id             uuid not null references public.matters(id) on delete cascade,
  requested_from        uuid not null references public.profiles(id) on delete cascade,
  requested_by          uuid references public.profiles(id) on delete set null,
  title                 text not null,
  description           text,
  due_date              date,
  status                public.request_status not null default 'pending',
  fulfilled_document_id uuid references public.documents(id) on delete set null,
  fulfilled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index document_requests_matter_idx on public.document_requests (matter_id, status);

-- ----------------------------------------------------------------------------
-- 7. MESSAGERIE (propre au portail — option (b) de clio-api-mapping.md)
-- ----------------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  matter_id       uuid references public.matters(id) on delete cascade,
  scope           public.conversation_scope not null default 'matter',
  subject         text,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  check ((scope = 'matter') = (matter_id is not null))
);
create index conversations_matter_idx on public.conversations (matter_id);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  last_read_at    timestamptz,
  added_at        timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  body            text not null check (length(btrim(body)) between 1 and 10000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

create table public.message_attachments (
  message_id  uuid not null references public.messages(id)  on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict,
  primary key (message_id, document_id)
);

-- ----------------------------------------------------------------------------
-- 8. FACTURATION, PAIEMENT, SIGNATURE
-- ----------------------------------------------------------------------------
-- Cache d'affichage — source de vérité : Clio Manage Bills.
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  clio_bill_id   text unique,
  matter_id      uuid not null references public.matters(id) on delete cascade,
  invoice_number text not null,                 -- ex. « INV-2026-0089 »
  issued_at      date,
  due_at         date,
  amount_total   numeric(12,2) not null check (amount_total >= 0),
  balance_due    numeric(12,2) not null check (balance_due >= 0),
  currency       char(3) not null default 'CAD',
  status         public.invoice_status not null default 'due',
  clio_state     text,                          -- état Clio brut, pour diagnostic
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index invoices_matter_idx on public.invoices (matter_id, status);

-- Abstraction PaymentProvider. Aucune donnée de carte ici, jamais.
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references public.invoices(id) on delete restrict,
  payer_id           uuid references public.profiles(id) on delete set null,
  provider           text not null check (provider in ('clio_payments', 'stripe', 'mock')),
  provider_reference text unique,
  idempotency_key    text not null unique,
  amount             numeric(12,2) not null check (amount > 0),
  currency           char(3) not null default 'CAD',
  status             public.payment_status not null default 'pending',
  failure_code       text,
  succeeded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);

-- Abstraction SignatureProvider (DocuSign en premier, à confirmer).
create table public.signature_requests (
  id                   uuid primary key default gen_random_uuid(),
  matter_id            uuid not null references public.matters(id)   on delete cascade,
  document_id          uuid not null references public.documents(id) on delete restrict,
  signer_id            uuid not null references public.profiles(id)  on delete cascade,
  requested_by         uuid references public.profiles(id) on delete set null,
  provider             text not null default 'mock' check (provider in ('docusign', 'mock')),
  provider_envelope_id text unique,
  status               public.signature_status not null default 'to_sign',
  due_at               timestamptz,
  sent_at              timestamptz,
  viewed_at            timestamptz,
  signed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index signature_requests_signer_idx on public.signature_requests (signer_id, status);

-- ----------------------------------------------------------------------------
-- 9. NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           public.notification_type     not null,
  priority       public.notification_priority not null default 'info',
  title          text not null,
  body           text,
  matter_id      uuid references public.matters(id) on delete cascade,
  reference_type text check (reference_type in ('matter', 'document', 'message', 'invoice', 'signature', 'appointment')),
  reference_id   uuid,
  action_url     text check (action_url is null or action_url like '/%'),  -- chemin interne uniquement
  read_at        timestamptz,
  emailed_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.notification_preferences (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  email_enabled  boolean not null default true,
  sms_enabled    boolean not null default false,   -- préparé, jamais activé par défaut
  in_app_enabled boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. INVITATIONS (activation d'un client — initiée par un firm_admin)
-- ----------------------------------------------------------------------------
create table public.client_invitations (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  first_name         text,
  last_name          text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'fr')),
  clio_contact_id    text,
  organization_id    uuid references public.organizations(id) on delete set null,
  token_hash         text not null unique,       -- SHA-256 du jeton ; le jeton clair n'est jamais stocké
  status             public.invitation_status not null default 'pending',
  invited_by         uuid references public.profiles(id) on delete set null,
  expires_at         timestamptz not null default now() + interval '72 hours',
  accepted_at        timestamptz,
  accepted_user_id   uuid references public.profiles(id) on delete set null,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index client_invitations_one_pending_key
  on public.client_invitations (lower(email)) where status = 'pending';

create table public.client_invitation_matters (
  invitation_id uuid not null references public.client_invitations(id) on delete cascade,
  matter_id     uuid not null references public.matters(id) on delete restrict,
  access_level  public.access_level not null default 'read',
  primary key (invitation_id, matter_id)
);

-- ----------------------------------------------------------------------------
-- 11. INTÉGRATIONS, SYNCHRONISATION, WEBHOOKS (schéma private, non exposé)
-- ----------------------------------------------------------------------------
create table private.integration_connections (
  id              uuid primary key default gen_random_uuid(),
  provider        private.integration_provider not null,
  region          text,                          -- 'ca'
  status          private.integration_status not null default 'not_configured',
  vault_secret_id uuid,                          -- référence Supabase Vault / Key Vault, jamais le secret
  scopes          text[] not null default '{}',
  connected_by    uuid references public.profiles(id) on delete set null,
  connected_at    timestamptz,
  last_sync_at    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, region)
);

create table private.sync_jobs (
  id            uuid primary key default gen_random_uuid(),
  provider      private.integration_provider not null,
  resource_type private.sync_resource_type   not null,
  resource_id   text,
  status        private.sync_status not null default 'queued',
  attempts      smallint not null default 0,
  max_attempts  smallint not null default 5,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  error_code    text,
  error_detail  text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index sync_jobs_queue_idx on private.sync_jobs (status, run_after) where status in ('queued', 'failed');

-- Idempotence + traçabilité des webhooks (Clio, Graph, DocuSign, paiement).
create table private.webhook_events (
  id                uuid primary key default gen_random_uuid(),
  provider          private.integration_provider not null,
  external_event_id text,
  resource_type     text,
  resource_id       text,
  signature_valid   boolean not null,
  status            private.webhook_status not null default 'received',
  error             text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, external_event_id)
);

-- Emplacement SharePoint de chaque dossier (créé par le portail, idempotent).
-- Non exposé : les identifiants et URL SharePoint ne sont jamais envoyés au client.
create table private.matter_storage_folders (
  matter_id              uuid primary key references public.matters(id) on delete restrict,
  site_id                text not null,
  drive_id               text not null,
  root_item_id           text not null,          -- « LC-2026-0142 — Doe, John — … »
  shared_item_id         text not null,          -- 01 Partagé avec le client
  client_upload_item_id  text not null,          -- 02 Déposé par le client
  signed_item_id         text not null,          -- 03 Signés
  web_url                text,                   -- lien pour le personnel (espace admin uniquement)
  created_at             timestamptz not null default now(),
  unique (drive_id, root_item_id)
);

-- Synchronisation incrémentale Microsoft Graph (requête delta par bibliothèque).
create table private.graph_delta_state (
  drive_id      text primary key,
  delta_link    text,                            -- jeton de reprise renvoyé par Graph
  last_run_at   timestamptz,
  last_error    text
);

-- Abonnements de notification Graph (durée de vie limitée : renouvellement planifié).
create table private.graph_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  subscription_id    text not null unique,       -- id renvoyé par Graph
  resource           text not null,              -- ex. 'drives/{drive-id}/root'
  change_type        text not null default 'updated',
  client_state_hash  text not null,              -- SHA-256 du clientState (vérifié à chaque notification)
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  renewed_at         timestamptz
);
create index graph_subscriptions_expiry_idx on private.graph_subscriptions (expires_at);

-- Limitation de débit applicative (connexion, téléversement, invitations).
create table private.rate_limit_buckets (
  key          text primary key,                 -- ex. 'login:ip:203.0.113.4'
  window_start timestamptz not null,
  hits         integer not null default 0
);

-- ----------------------------------------------------------------------------
-- 12. JOURNAL D'AUDIT (schéma audit, append-only)
-- ----------------------------------------------------------------------------
create table audit.events (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,                            -- pas de FK : l'audit survit à la suppression d'un compte
  actor_role    public.app_role,
  actor_email   text,
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),   -- ex. 'matter_access.revoked'
  resource_type text not null,
  resource_id   text,
  matter_id     uuid,
  ip_address    inet,
  user_agent    text,
  request_id    text,
  metadata      jsonb not null default '{}'
);
create index audit_events_occurred_idx on audit.events (occurred_at desc);
create index audit_events_matter_idx   on audit.events (matter_id, occurred_at desc);
create index audit_events_actor_idx    on audit.events (actor_id, occurred_at desc);

create or replace function audit.forbid_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit.events est append-only (% interdit)', tg_op;
end $$;

create trigger audit_events_no_update before update or delete on audit.events
  for each row execute function audit.forbid_mutation();
create trigger audit_events_no_truncate before truncate on audit.events
  for each statement execute function audit.forbid_mutation();

-- Enregistrement d'un événement. Exécutable par le serveur uniquement
-- (service_role) et par les triggers ci-dessous.
create or replace function audit.record(
  p_action        text,
  p_resource_type text,
  p_resource_id   text  default null,
  p_matter_id     uuid  default null,
  p_metadata      jsonb default '{}',
  p_actor_id      uuid  default null,
  p_ip            inet  default null,
  p_user_agent    text  default null,
  p_request_id    text  default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := coalesce(p_actor_id, auth.uid());
  v_id    bigint;
begin
  insert into audit.events (actor_id, actor_role, actor_email, action, resource_type,
                            resource_id, matter_id, ip_address, user_agent, request_id, metadata)
  select v_actor, p.role, p.email, p_action, p_resource_type,
         p_resource_id, p_matter_id, p_ip, p_user_agent, p_request_id, coalesce(p_metadata, '{}')
  from (select 1) x
  left join public.profiles p on p.id = v_actor
  returning id into v_id;
  return v_id;
end $$;
revoke all on function audit.record(text, text, text, uuid, jsonb, uuid, inet, text, text) from public;
grant execute on function audit.record(text, text, text, uuid, jsonb, uuid, inet, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 13. FONCTIONS D'AIDE RLS (security definer, search_path vide)
-- ----------------------------------------------------------------------------
-- Rôle de l'utilisateur courant, uniquement si son compte est actif.
create or replace function private.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() in ('staff', 'firm_admin'), false)
$$;

create or replace function private.is_firm_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = 'firm_admin', false)
$$;

-- Session MFA (Authenticator Assurance Level 2) — exigée pour les clients.
create or replace function private.has_mfa()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function private.is_on_matter_team(p_matter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matter_team mt
    where mt.matter_id = p_matter and mt.user_id = auth.uid()
  ) and private.is_staff()
$$;

-- Accès client actif (non révoqué) à un dossier, avec MFA.
create or replace function private.client_access_level(p_matter uuid)
returns public.access_level language sql stable security definer set search_path = '' as $$
  select ma.access_level
  from public.matter_access ma
  where ma.matter_id = p_matter
    and ma.user_id = auth.uid()
    and ma.revoked_at is null
    and private.current_app_role() = 'client'
    and private.has_mfa()
$$;

create or replace function private.can_read_matter(p_matter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_firm_admin()
      or private.is_on_matter_team(p_matter)
      or private.client_access_level(p_matter) is not null
$$;

create or replace function private.can_write_matter(p_matter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_firm_admin()
      or private.is_on_matter_team(p_matter)
      or private.client_access_level(p_matter) = 'read_write'
$$;

create or replace function private.is_conversation_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id = auth.uid()
  )
$$;

-- Un utilisateur peut-il voir le profil p_user ?
--   firm_admin : tous ; staff : le personnel + les clients de ses dossiers ;
--   client : lui-même + le personnel affecté à ses dossiers.
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
      or private.is_firm_admin()
      or (private.is_staff() and (
            exists (select 1 from public.profiles p where p.id = p_user and p.role in ('staff', 'firm_admin'))
         or exists (select 1 from public.matter_access ma
                    join public.matter_team mt on mt.matter_id = ma.matter_id and mt.user_id = auth.uid()
                    where ma.user_id = p_user)))
      or exists (select 1 from public.matter_team mt
                 where mt.user_id = p_user and private.client_access_level(mt.matter_id) is not null)
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.current_app_role(), private.is_staff(), private.is_firm_admin(), private.has_mfa(),
  private.is_on_matter_team(uuid), private.client_access_level(uuid),
  private.can_read_matter(uuid), private.can_write_matter(uuid),
  private.is_conversation_participant(uuid), private.can_see_profile(uuid)
to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. TRIGGERS MÉTIER ET DE SÉCURITÉ
-- ----------------------------------------------------------------------------

-- 14.1 Création du profil à l'inscription (auth.users).
-- Personnel = connexion Entra ID ('azure') ET domaine autorisé. Tout autre
-- compte devient 'client' sans aucun accès (aucune ligne matter_access).
-- firm_admin n'est JAMAIS attribué automatiquement.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_domain   text := lower(split_part(new.email, '@', 2));
  v_is_staff boolean;
begin
  v_is_staff := v_provider = 'azure'
            and exists (select 1 from private.staff_email_domains d where d.domain = v_domain);

  insert into public.profiles (id, email, first_name, last_name, role, status)
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    case when v_is_staff then 'staff'::public.app_role else 'client'::public.app_role end,
    case when v_is_staff then 'active'::public.user_status
         when v_provider = 'azure' then 'suspended'::public.user_status   -- Entra hors domaine : aucun accès
         else 'invited'::public.user_status end
  );
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 14.2 Garde-fous sur profiles : un rôle personnel exige un domaine autorisé ;
-- rôle et statut ne changent que côté serveur (service_role) — en plus des
-- droits par colonne définis plus bas.
create or replace function private.guard_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role in ('staff', 'firm_admin') and not exists (
       select 1 from private.staff_email_domains d
       where d.domain = lower(split_part(new.email, '@', 2))) then
    raise exception 'Rôle % refusé : domaine e-mail non autorisé', new.role;
  end if;

  if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.status is distinct from old.status
                           or new.email is distinct from old.email) then
    if coalesce(auth.role(), '') = 'authenticated' then
      raise exception 'Modification du rôle, du statut ou de l''e-mail réservée au serveur';
    end if;
    perform audit.record('profile.role_status_changed', 'profile', new.id::text, null,
      jsonb_build_object('old_role', old.role, 'new_role', new.role,
                         'old_status', old.status, 'new_status', new.status));
  end if;
  return new;
end $$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.guard_profile();

-- 14.3 matter_team : seul le personnel peut être membre d'une équipe.
create or replace function private.guard_matter_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p
                 where p.id = new.user_id and p.role in ('staff', 'firm_admin')) then
    raise exception 'Seul le personnel peut être affecté à une équipe de dossier';
  end if;
  return new;
end $$;

create trigger matter_team_guard before insert or update on public.matter_team
  for each row execute function private.guard_matter_team();

-- 14.4 matter_access : seul un client peut recevoir un accès ; une ligne est
-- immuable sauf sa révocation (une seule fois, jamais annulée).
create or replace function private.guard_matter_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'client') then
      raise exception 'matter_access est réservé aux comptes clients';
    end if;
    new.granted_by := coalesce(new.granted_by, auth.uid());
    new.granted_at := now();
    new.revoked_at := null;
    return new;
  end if;

  if old.revoked_at is not null then
    raise exception 'Un accès révoqué ne peut pas être modifié (créer un nouvel octroi)';
  end if;
  if (new.matter_id, new.user_id, new.access_level, new.granted_by, new.granted_at)
     is distinct from (old.matter_id, old.user_id, old.access_level, old.granted_by, old.granted_at) then
    raise exception 'Seule la révocation est autorisée sur matter_access';
  end if;
  if new.revoked_at is not null then
    new.revoked_at := now();
    new.revoked_by := coalesce(new.revoked_by, auth.uid());
  end if;
  return new;
end $$;

create trigger matter_access_guard before insert or update on public.matter_access
  for each row execute function private.guard_matter_access();

create or replace function private.audit_matter_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('matter_access.granted', 'matter_access', new.id::text, new.matter_id,
      jsonb_build_object('user_id', new.user_id, 'access_level', new.access_level));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform audit.record('matter_access.revoked', 'matter_access', new.id::text, new.matter_id,
      jsonb_build_object('user_id', new.user_id, 'reason', new.revoke_reason));
  end if;
  return null;
end $$;

create trigger matter_access_audit after insert or update on public.matter_access
  for each row execute function private.audit_matter_access();

create or replace function private.audit_matter_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform audit.record('matter_team.removed', 'matter_team', old.user_id::text, old.matter_id, '{}');
    return old;
  end if;
  perform audit.record('matter_team.added', 'matter_team', new.user_id::text, new.matter_id,
    jsonb_build_object('role', new.role));
  return new;
end $$;

create trigger matter_team_audit after insert or delete on public.matter_team
  for each row execute function private.audit_matter_team();

create or replace function private.audit_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('invitation.created', 'client_invitation', new.id::text, null,
      jsonb_build_object('email', new.email));
  elsif new.status is distinct from old.status then
    perform audit.record('invitation.' || new.status::text, 'client_invitation', new.id::text, null,
      jsonb_build_object('email', new.email));
  end if;
  return null;
end $$;

create trigger client_invitations_audit after insert or update on public.client_invitations
  for each row execute function private.audit_invitation();

-- 14.5 Messagerie : le créateur devient participant ; last_message_at à jour.
create or replace function private.on_conversation_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values (new.id, new.created_by) on conflict do nothing;
  end if;
  return null;
end $$;

create trigger conversations_add_creator after insert on public.conversations
  for each row execute function private.on_conversation_created();

create or replace function private.on_message_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end $$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function private.on_message_created();

-- 14.6 updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'organizations', 'matters', 'matter_timeline_steps', 'appointments',
    'documents', 'document_requests', 'invoices', 'payments', 'signature_requests',
    'notification_preferences'
  ] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
create trigger integration_connections_updated_at before update on private.integration_connections
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- 15. DROITS (défense en profondeur : RLS + privilèges explicites)
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all tables in schema audit   from anon, authenticated;

grant select on all tables in schema public to authenticated;

-- Le client modifie uniquement ses informations personnelles.
grant update (first_name, last_name, phone, preferred_language, last_seen_at) on public.profiles to authenticated;

-- Écritures du personnel (filtrées par RLS).
grant insert, update on public.matters, public.matter_timeline_steps, public.appointments,
                        public.documents, public.document_requests, public.signature_requests
  to authenticated;
grant insert, delete on public.matter_team to authenticated;
grant insert, update on public.matter_access to authenticated;
grant insert, update on public.organizations, public.client_invitations to authenticated;
grant insert, delete on public.organization_members, public.client_invitation_matters to authenticated;

-- Messagerie.
grant insert on public.conversations, public.messages, public.conversation_participants to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
grant update (closed_at, subject) on public.conversations to authenticated;

-- Notifications et préférences.
grant update (read_at) on public.notifications to authenticated;
grant insert, update on public.notification_preferences to authenticated;

-- Le serveur (service_role) garde l'accès complet (synchronisation, webhooks,
-- invitations) ; il contourne RLS par conception et ne quitte jamais le serveur.
grant all on all tables in schema public, private, audit to service_role;
grant usage, select on all sequences in schema audit to service_role;

-- ----------------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations / organization_members
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_staff() or exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id and om.user_id = auth.uid()));
create policy organizations_admin_write on public.organizations for all to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or private.is_staff());
create policy organization_members_admin_write on public.organization_members for all to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

-- external_accounts (écriture : serveur uniquement)
create policy external_accounts_select on public.external_accounts for select to authenticated
  using (user_id = auth.uid() or private.is_firm_admin());

-- matters
create policy matters_select on public.matters for select to authenticated
  using (private.can_read_matter(id));
create policy matters_admin_insert on public.matters for insert to authenticated
  with check (private.is_firm_admin());
create policy matters_staff_update on public.matters for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(id))
  with check (private.is_firm_admin() or private.is_on_matter_team(id));

-- matter_team
create policy matter_team_select on public.matter_team for select to authenticated
  using (private.can_read_matter(matter_id));
create policy matter_team_admin_insert on public.matter_team for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_team_admin_delete on public.matter_team for delete to authenticated
  using (private.is_firm_admin());

-- matter_access (aucune suppression : on révoque)
create policy matter_access_select on public.matter_access for select to authenticated
  using (user_id = auth.uid() or private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_access_admin_insert on public.matter_access for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_access_admin_revoke on public.matter_access for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

-- matter_timeline_steps / appointments (lecture : dossier lisible ; écriture : équipe)
create policy timeline_select on public.matter_timeline_steps for select to authenticated
  using (private.can_read_matter(matter_id));
create policy timeline_staff_insert on public.matter_timeline_steps for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy timeline_staff_update on public.matter_timeline_steps for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

create policy appointments_select on public.appointments for select to authenticated
  using (private.can_read_matter(matter_id));
create policy appointments_staff_insert on public.appointments for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy appointments_staff_update on public.appointments for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

-- documents : le client ne voit que les documents des sous-dossiers client
-- (partagés, déposés, signés), sains, non supprimés. Le téléversement client passe par le serveur
-- (antivirus) : aucune insertion directe par un client.
create policy documents_select on public.documents for select to authenticated
  using (
    private.can_read_matter(matter_id) and (
      private.is_staff()
      or (deleted_at is null
          and scan_status in ('clean', 'not_required')
          and folder <> 'internal')                -- un document interne n'est JAMAIS visible du client
    ));
create policy documents_staff_insert on public.documents for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy documents_staff_update on public.documents for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

create policy document_requests_select on public.document_requests for select to authenticated
  using (private.can_read_matter(matter_id) and (private.is_staff() or requested_from = auth.uid()));
create policy document_requests_staff_insert on public.document_requests for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy document_requests_staff_update on public.document_requests for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

-- conversations : participant ET (si liée à un dossier) dossier encore lisible
-- → une révocation coupe aussi la messagerie.
create policy conversations_select on public.conversations for select to authenticated
  using ((matter_id is null or private.can_read_matter(matter_id))
         and (private.is_conversation_participant(id)
              or (matter_id is not null and private.is_staff())));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (created_by = auth.uid()
              and ((scope = 'matter' and private.can_write_matter(matter_id))
                   or (scope = 'general' and private.is_staff())));
create policy conversations_staff_update on public.conversations for update to authenticated
  using (private.is_staff() and (matter_id is null or private.can_write_matter(matter_id)))
  with check (private.is_staff());

create policy participants_select on public.conversation_participants for select to authenticated
  using (private.is_conversation_participant(conversation_id) or private.is_staff());
create policy participants_staff_insert on public.conversation_participants for insert to authenticated
  with check (private.is_staff() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.matter_id is null or private.can_write_matter(c.matter_id))));
create policy participants_update_self on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_select on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.matter_id is null or private.can_read_matter(c.matter_id))
      and private.is_conversation_participant(c.id)));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.closed_at is null
      and private.is_conversation_participant(c.id)
      and (c.matter_id is null or private.can_write_matter(c.matter_id))));

create policy message_attachments_select on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));   -- hérite de messages_select

-- invoices / payments (écriture : serveur uniquement)
create policy invoices_select on public.invoices for select to authenticated
  using (private.can_read_matter(matter_id));

create policy payments_select on public.payments for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = payments.invoice_id and private.can_read_matter(i.matter_id)
      and (private.is_staff() or payments.payer_id = auth.uid())));

-- signature_requests
create policy signatures_select on public.signature_requests for select to authenticated
  using (private.can_read_matter(matter_id) and (private.is_staff() or signer_id = auth.uid()));
create policy signatures_staff_insert on public.signature_requests for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy signatures_staff_update on public.signature_requests for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

-- notifications (création : serveur uniquement)
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid() and (matter_id is null or private.can_read_matter(matter_id)));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invitations (firm_admin uniquement ; l'acceptation passe par le serveur)
create policy invitations_admin on public.client_invitations for all to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy invitation_matters_admin on public.client_invitation_matters for all to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

-- ----------------------------------------------------------------------------
-- 17. RPC EXPOSÉES (lecture admin de l'audit, compteurs du tableau de bord)
-- ----------------------------------------------------------------------------
create or replace function public.list_audit_events(
  p_limit     integer     default 50,
  p_before    timestamptz default null,
  p_matter_id uuid        default null
) returns setof audit.events
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_firm_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select * from audit.events e
    where (p_before is null or e.occurred_at < p_before)
      and (p_matter_id is null or e.matter_id = p_matter_id)
    order by e.occurred_at desc
    limit least(greatest(p_limit, 1), 200);
end $$;

-- Cartes du tableau de bord client (maquette : 4 indicateurs). security
-- invoker : chaque sous-requête reste filtrée par RLS.
create or replace function public.client_dashboard_counts()
returns table (active_matters bigint, pending_documents bigint, unread_messages bigint, outstanding_balance numeric)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.matters m where m.status <> 'closed'),
    (select count(*) from public.document_requests r where r.status = 'pending' and r.requested_from = auth.uid()),
    (select count(*) from public.messages msg
       join public.conversation_participants cp on cp.conversation_id = msg.conversation_id and cp.user_id = auth.uid()
       where msg.sender_id <> auth.uid() and (cp.last_read_at is null or msg.created_at > cp.last_read_at)),
    (select coalesce(sum(i.balance_due), 0) from public.invoices i where i.status in ('due', 'overdue'))
$$;

revoke all on function public.list_audit_events(integer, timestamptz, uuid) from public, anon;
revoke all on function public.client_dashboard_counts() from public, anon;
grant execute on function public.list_audit_events(integer, timestamptz, uuid) to authenticated;
grant execute on function public.client_dashboard_counts() to authenticated;
-- ============================================================================
-- FIN DU SCHÉMA — Bucket de quarantaine Storage : voir docs/database.md §6.
-- ============================================================================
