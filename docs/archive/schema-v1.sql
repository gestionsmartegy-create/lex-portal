-- ============================================================================
-- LEX CANADA — PORTAIL CLIENT — SCHÉMA SUPABASE (CONCEPTION)
-- ============================================================================
-- Ce fichier est un document de CONCEPTION, pas une migration exécutée.
-- Aucune valeur réelle, aucun secret. À faire relire avant toute exécution
-- réelle sur un projet Supabase (voir docs/decisions/0001-perimetre-phase-0.md).
--
-- Principes respectés :
--   - Supabase = comptes, droits, cache non-autoritaire, journaux, données
--     propres au portail. JAMAIS la source de vérité des dossiers Clio.
--   - Toutes les tables exposées à PostgREST doivent avoir RLS activé.
--   - Aucune donnée bancaire, aucun jeton OAuth en clair, aucun contenu de
--     document stocké ici — uniquement des références.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- recherche texte (filtre dossiers/documents)

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_status            as enum ('invited', 'active', 'suspended', 'deactivated');
create type org_type                as enum ('law_firm', 'client_organization', 'partner');
create type member_role             as enum ('client', 'firm_admin', 'staff');
create type access_level            as enum ('read', 'read_write');
create type matter_status           as enum ('open', 'action_required', 'on_hold', 'closed');
create type document_status         as enum ('requested', 'received', 'in_review', 'accepted', 'rejected');
create type request_status          as enum ('pending', 'fulfilled', 'overdue', 'cancelled');
create type conversation_scope      as enum ('matter', 'general');
create type notification_type       as enum (
  'new_document', 'document_requested', 'new_message', 'new_appointment',
  'matter_status_changed', 'invoice_available', 'signature_required'
);
create type signature_status        as enum ('to_sign', 'sent', 'viewed', 'signed', 'expired', 'declined');
create type payment_status          as enum ('pending', 'succeeded', 'failed', 'refunded');
create type integration_provider    as enum ('clio_manage', 'clio_grow', 'microsoft_graph', 'docusign', 'stripe', 'clio_payments', 'power_automate'); -- 'power_automate' anticipé pour déclencher des flux internes (Integration Layer du mémorandum EA), non implémenté avant confirmation
create type integration_status      as enum ('not_configured', 'connected', 'error', 'revoked');
create type sync_resource_type      as enum ('matter', 'contact', 'bill', 'calendar_entry', 'document');
create type sync_status             as enum ('queued', 'running', 'succeeded', 'failed');

-- ----------------------------------------------------------------------------
-- IDENTITÉ ET ORGANISATION
-- ----------------------------------------------------------------------------

-- Étend auth.users (Supabase Auth) — 1:1 via id
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  first_name          text,
  last_name           text,
  preferred_language  text not null default 'fr' check (preferred_language in ('fr', 'en')),
  phone               text,
  status              user_status not null default 'invited',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        org_type not null,
  created_at  timestamptz not null default now()
);

create table public.organization_members (
  organization_id  uuid references public.organizations(id) on delete cascade,
  user_id          uuid references public.profiles(id) on delete cascade,
  role             member_role not null,
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Correspondance identité portail <-> identité externe (Clio, futur Entra ID, etc.)
create table public.external_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  provider              text not null,          -- 'clio' | 'entra_id' | ...
  external_contact_id   text not null,
  external_region       text,                    -- ex. 'ca'
  metadata              jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  unique (provider, external_contact_id)
);

-- ----------------------------------------------------------------------------
-- DOSSIERS (cache non-autoritaire) ET ACCÈS
-- ----------------------------------------------------------------------------

-- Cache non-autoritaire d'un "matter" Clio. Source de vérité = Clio Manage.
create table public.matter_cache (
  clio_matter_id          text primary key,
  display_number          text,
  title                   text not null,
  status                  matter_status not null default 'open',
  practice_area           text,
  responsible_professional text,
  responsible_email       text,
  progress_percent        smallint check (progress_percent between 0 and 100),
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now()
);

-- Étapes de la chronologie affichée au client (construite par le portail,
-- alimentée manuellement par le cabinet ou dérivée d'activités Clio - à valider)
create table public.matter_timeline_steps (
  id           uuid primary key default gen_random_uuid(),
  matter_id    text not null references public.matter_cache(clio_matter_id) on delete cascade,
  title        text not null,
  description  text,
  is_completed boolean not null default false,
  position     smallint not null,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Droit d'accès d'un client à un dossier — TABLE CENTRALE DE SÉCURITÉ
create table public.matter_access (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  matter_id    text not null references public.matter_cache(clio_matter_id) on delete cascade,
  access_level access_level not null default 'read',
  granted_by   uuid references public.profiles(id),
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (user_id, matter_id)
);
create index idx_matter_access_active on public.matter_access (user_id, matter_id) where revoked_at is null;

-- ----------------------------------------------------------------------------
-- RENDEZ-VOUS (cache, source de vérité = Clio Calendar)
-- ----------------------------------------------------------------------------
create table public.appointment_cache (
  id                   uuid primary key default gen_random_uuid(),
  clio_calendar_entry_id text unique,
  matter_id            text references public.matter_cache(clio_matter_id) on delete cascade,
  title                text not null,
  starts_at            timestamptz not null,
  ends_at              timestamptz,
  timezone             text not null default 'America/Toronto',
  location_or_link     text,
  responsible_professional text,
  last_synced_at       timestamptz
);

-- ----------------------------------------------------------------------------
-- DOCUMENTS (références uniquement — contenu chez SharePoint/Clio)
-- ----------------------------------------------------------------------------
create table public.document_links (
  id                    uuid primary key default gen_random_uuid(),
  matter_id             text not null references public.matter_cache(clio_matter_id) on delete cascade,
  provider              text not null check (provider in ('sharepoint', 'clio', 'imanage')), -- 'imanage' anticipé (Future Phase, mémorandum EA), non utilisé avant confirmation
  sharepoint_drive_id   text,
  sharepoint_item_id    text,
  clio_document_id      text,
  display_name          text not null,
  category              text,
  status                document_status not null default 'received',
  mime_type             text,
  size_bytes            bigint,
  uploaded_by           uuid references public.profiles(id),
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now()
);

create table public.document_requests (
  id           uuid primary key default gen_random_uuid(),
  matter_id    text not null references public.matter_cache(clio_matter_id) on delete cascade,
  client_id    uuid not null references public.profiles(id),
  title        text not null,
  description  text,
  due_date     date,
  status       request_status not null default 'pending',
  fulfilled_by_document_id uuid references public.document_links(id),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MESSAGERIE (propre au portail — voir clio-api-mapping.md, à confirmer avec Clio)
-- ----------------------------------------------------------------------------
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  matter_id   text references public.matter_cache(clio_matter_id) on delete cascade,
  scope       conversation_scope not null default 'matter',
  subject     text,
  created_at  timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  added_at        timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  body            text not null,
  created_at      timestamptz not null default now()
);

create table public.message_read_receipts (
  message_id uuid references public.messages(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  document_id  uuid references public.document_links(id),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FACTURATION (cache — source de vérité = Clio Manage Bills)
-- ----------------------------------------------------------------------------
create table public.invoice_cache (
  id                text primary key,             -- id Clio du bill
  matter_id         text references public.matter_cache(clio_matter_id) on delete cascade,
  invoice_number    text,
  amount_total      numeric(12,2) not null,
  balance_due       numeric(12,2) not null,
  currency          text not null default 'CAD',
  issued_at         date,
  due_at            date,
  status            text,                          -- reflète le statut Clio tel quel
  pdf_reference     text,                           -- lien/à télécharger via serveur, jamais stocké en clair
  last_synced_at    timestamptz
);

-- Paiement — abstraction PaymentProvider ; jamais de données de carte stockées ici
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        text references public.invoice_cache(id),
  provider          text not null,                 -- 'clio_payments' | 'stripe' | 'mock'
  provider_reference text,                          -- id externe de la transaction
  amount            numeric(12,2) not null,
  currency          text not null default 'CAD',
  status            payment_status not null default 'pending',
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SIGNATURE ÉLECTRONIQUE (abstraction SignatureProvider — DocuSign en 1er)
-- ----------------------------------------------------------------------------
create table public.signature_requests (
  id                  uuid primary key default gen_random_uuid(),
  matter_id           text references public.matter_cache(clio_matter_id) on delete cascade,
  document_id         uuid references public.document_links(id),
  provider            text not null default 'docusign',
  provider_envelope_id text,
  status              signature_status not null default 'to_sign',
  requested_for       uuid not null references public.profiles(id),
  due_at              timestamptz,
  signed_at           timestamptz,
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        notification_type not null,
  title       text not null,
  message     text,
  reference_type text,          -- 'matter' | 'document' | 'message' | 'invoice' | 'signature'
  reference_id    text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.notification_preferences (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  email_enabled  boolean not null default true,
  sms_enabled    boolean not null default false,   -- jamais activé par défaut
  in_app_enabled boolean not null default true
);

-- ----------------------------------------------------------------------------
-- INTÉGRATIONS, SYNCHRONISATION, AUDIT
-- ----------------------------------------------------------------------------
create table public.integration_connections (
  id                              uuid primary key default gen_random_uuid(),
  provider                        integration_provider not null,
  region                          text,                          -- ex. 'ca'
  status                          integration_status not null default 'not_configured',
  encrypted_credentials_reference text,                          -- référence vers le coffre-fort, jamais le secret
  last_sync_at                   timestamptz,
  created_at                      timestamptz not null default now()
);

create table public.sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  provider       integration_provider not null,
  resource_type  sync_resource_type not null,
  resource_id    text,
  status         sync_status not null default 'queued',
  attempts       smallint not null default 0,
  error_code     text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles(id),
  action        text not null,           -- ex. 'matter_access.revoked', 'document.downloaded'
  resource_type text not null,
  resource_id   text,
  ip_address    inet,
  user_agent    text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY — ACTIVATION (politiques détaillées en Phase 1, testées en CI)
-- ============================================================================
alter table public.profiles                  enable row level security;
alter table public.organizations             enable row level security;
alter table public.organization_members       enable row level security;
alter table public.external_accounts         enable row level security;
alter table public.matter_cache              enable row level security;
alter table public.matter_timeline_steps     enable row level security;
alter table public.matter_access             enable row level security;
alter table public.appointment_cache         enable row level security;
alter table public.document_links            enable row level security;
alter table public.document_requests         enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_read_receipts     enable row level security;
alter table public.message_attachments       enable row level security;
alter table public.invoice_cache             enable row level security;
alter table public.payments                  enable row level security;
alter table public.signature_requests        enable row level security;
alter table public.notifications             enable row level security;
alter table public.notification_preferences  enable row level security;
alter table public.integration_connections   enable row level security;
alter table public.sync_jobs                 enable row level security;
alter table public.audit_events              enable row level security;

-- Exemple illustratif (à compléter et tester en Phase 1) :
-- un client ne voit que les dossiers présents dans matter_access, non révoqués.
--
-- create policy "clients read own accessible matters"
--   on public.matter_cache for select
--   using (
--     exists (
--       select 1 from public.matter_access ma
--       where ma.matter_id = matter_cache.clio_matter_id
--         and ma.user_id = auth.uid()
--         and ma.revoked_at is null
--     )
--   );
--
-- Le service_role (utilisé uniquement côté serveur pour les synchronisations)
-- contourne RLS par conception Supabase — il ne doit JAMAIS être exposé au
-- navigateur (voir docs/security.md).
