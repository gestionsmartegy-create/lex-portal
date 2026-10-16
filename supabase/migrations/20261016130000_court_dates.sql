-- ============================================================================
-- Dates de cour (ADR 0025, lot 2 du plan « bureaux et calendrier de cour »).
-- Décision du 2026-10-16 : la date se saisit dans la plateforme, qui l'écrit dans Clio
-- (API Calendar Entries, création, modification et suppression documentées).
--  1. public.court_dates : procès, audiences, requêtes, conférences, comparutions, dates de dépôt.
--  2. public.court_date_attendees : membres du cabinet présents.
--  3. Paramètre : calendrier Clio où sont écrites les dates (choisi par le firm_admin).
-- Accès : équipe du dossier ou firm_admin (le client n'y accède pas : lot 5).
-- Pas de suppression : on annule avec un motif (journalisé). La plateforme ne calcule aucun délai légal.
-- ============================================================================

create table public.court_dates (
  id                     uuid primary key default gen_random_uuid(),
  matter_id              uuid not null references public.matters(id) on delete cascade,
  kind                   text not null check (kind in ('trial', 'hearing', 'motion', 'case_conference',
                                                       'appearance', 'filing_deadline')),
  starts_at              timestamptz not null,
  ends_at                timestamptz,
  all_day                boolean not null default false,
  -- Fuseau dans lequel la date a été saisie et s'affiche (tribunal, sinon bureau du dossier).
  timezone               text not null check (timezone in ('America/St_Johns', 'America/Halifax', 'America/Toronto',
                                                  'America/Winnipeg', 'America/Regina', 'America/Edmonton',
                                                  'America/Vancouver', 'America/Whitehorse')),
  court_id               uuid references public.courts(id) on delete restrict,
  room                   text check (room is null or length(room) <= 80),
  judge                  text check (judge is null or length(judge) <= 120),
  docket_number          text check (docket_number is null or length(docket_number) <= 80),
  mode                   text not null default 'in_person' check (mode in ('in_person', 'virtual', 'hybrid')),
  virtual_link           text check (virtual_link is null or (length(virtual_link) <= 500 and virtual_link ~ '^https://')),
  notes                  text check (notes is null or length(notes) <= 2000),
  client_instructions    text check (client_instructions is null or length(client_instructions) <= 2000),
  visible_to_client      boolean not null default false,
  status                 text not null default 'scheduled'
                           check (status in ('scheduled', 'confirmed', 'adjourned', 'cancelled', 'held')),
  confirmed_by           uuid references public.profiles(id) on delete set null,
  confirmed_at           timestamptz,
  replaces_id            uuid references public.court_dates(id) on delete set null,
  cancel_reason          text check (cancel_reason is null or length(btrim(cancel_reason)) between 1 and 500),
  clio_calendar_entry_id text,
  clio_sync_status       text not null default 'pending'
                           check (clio_sync_status in ('pending', 'synced', 'failed', 'not_applicable')),
  clio_synced_at         timestamptz,
  created_by             uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (status <> 'confirmed' or confirmed_at is not null),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index court_dates_matter_idx on public.court_dates (matter_id, starts_at);
create index court_dates_starts_idx on public.court_dates (starts_at);
create index court_dates_sync_idx on public.court_dates (clio_sync_status) where clio_sync_status in ('pending', 'failed');
create trigger court_dates_updated_at before update on public.court_dates
  for each row execute function private.set_updated_at();

create table public.court_date_attendees (
  court_date_id uuid not null references public.court_dates(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (court_date_id, user_id)
);
create index court_date_attendees_user_idx on public.court_date_attendees (user_id);

-- ---------------------------------------------------------------------------
-- RLS : équipe du dossier ou firm_admin.
-- ---------------------------------------------------------------------------
alter table public.court_dates enable row level security;
alter table public.court_date_attendees enable row level security;

create policy court_dates_select on public.court_dates for select to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy court_dates_insert on public.court_dates for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy court_dates_update on public.court_dates for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));

create policy court_date_attendees_select on public.court_date_attendees for select to authenticated
  using (exists (select 1 from public.court_dates c where c.id = court_date_id
                  and (private.is_firm_admin() or private.is_on_matter_team(c.matter_id))));
create policy court_date_attendees_insert on public.court_date_attendees for insert to authenticated
  with check (exists (select 1 from public.court_dates c where c.id = court_date_id
                       and (private.is_firm_admin() or private.is_on_matter_team(c.matter_id))));
create policy court_date_attendees_delete on public.court_date_attendees for delete to authenticated
  using (exists (select 1 from public.court_dates c where c.id = court_date_id
                  and (private.is_firm_admin() or private.is_on_matter_team(c.matter_id))));

-- Pas de suppression d'une date de cour : on l'annule (motif obligatoire).
grant select, insert, update on public.court_dates to authenticated;
grant select, insert, delete on public.court_date_attendees to authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fous
-- ---------------------------------------------------------------------------
create or replace function private.guard_court_date()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.confirmed_by := null;
    new.confirmed_at := null;
    if new.status not in ('scheduled', 'confirmed') then
      raise exception 'invalid initial status' using errcode = '23514';
    end if;
  else
    if new.matter_id <> old.matter_id or new.created_by is distinct from old.created_by
       or new.replaces_id is distinct from old.replaces_id then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    -- Une date annulée, remise ou tenue est figée (seul l'état de la synchronisation Clio évolue).
    if old.status in ('cancelled', 'adjourned', 'held')
       and (to_jsonb(new) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at'])
           is distinct from (to_jsonb(old) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at']) then
      raise exception 'court date closed' using errcode = '23514';
    end if;
    -- Date, heure, fuseau ou tribunal modifiés : la date doit être reconfirmée par un avocat.
    if old.status = 'confirmed' and new.status = 'confirmed'
       and (new.starts_at, new.ends_at, new.all_day, new.timezone, new.court_id)
           is distinct from (old.starts_at, old.ends_at, old.all_day, old.timezone, old.court_id) then
      new.status := 'scheduled';
    end if;
  end if;
  -- Confirmation : auteur et date imposés par la base ; retirés si la date n'est plus confirmée.
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  elsif new.status <> 'confirmed' and new.status not in ('held') then
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  if new.status <> 'cancelled' then
    new.cancel_reason := null;
  end if;
  -- Tout changement visible dans Clio repasse la synchronisation « à faire ».
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at',
                                'confirmed_by', 'confirmed_at', 'visible_to_client', 'client_instructions'])
         is distinct from (to_jsonb(old) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at',
                                'confirmed_by', 'confirmed_at', 'visible_to_client', 'client_instructions'])
     and new.clio_sync_status is not distinct from old.clio_sync_status
     and new.clio_sync_status <> 'not_applicable' then
    new.clio_sync_status := 'pending';
  end if;
  -- Le tribunal doit être actif à la saisie ou au changement.
  if new.court_id is not null and (tg_op = 'INSERT' or new.court_id is distinct from old.court_id)
     and not exists (select 1 from public.courts c where c.id = new.court_id and c.is_active) then
    raise exception 'court archived' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger court_dates_guard before insert or update on public.court_dates
  for each row execute function private.guard_court_date();

-- Seul un membre du personnel actif peut être noté présent.
create or replace function private.guard_court_date_attendee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = new.user_id and p.role in ('staff', 'firm_admin') and p.status = 'active') then
    raise exception 'not an active staff member' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger court_date_attendees_guard before insert on public.court_date_attendees
  for each row execute function private.guard_court_date_attendee();

-- ---------------------------------------------------------------------------
-- Journal (identifiants seulement : jamais de notes ni de consignes)
-- ---------------------------------------------------------------------------
create or replace function private.audit_court_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'court_date.created';
  elsif new.status is distinct from old.status then
    v_action := 'court_date.' || new.status;
  elsif (to_jsonb(new) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at'])
        is distinct from (to_jsonb(old) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at']) then
    v_action := 'court_date.updated';
  else
    return null; -- seule la synchronisation Clio a changé
  end if;
  perform audit.record(v_action, 'court_date', new.id::text, new.matter_id,
    jsonb_build_object('kind', new.kind, 'status', new.status, 'replaces_id', new.replaces_id));
  return null;
end $$;
create trigger court_dates_audit after insert or update on public.court_dates
  for each row execute function private.audit_court_date();

create or replace function private.audit_court_date_attendee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.court_date_attendees := coalesce(new, old);
  v_matter uuid;
begin
  select c.matter_id into v_matter from public.court_dates c where c.id = v_row.court_date_id;
  perform audit.record('court_date.attendee_' || lower(tg_op), 'court_date', v_row.court_date_id::text, v_matter,
    jsonb_build_object('user_id', v_row.user_id));
  return null;
end $$;
create trigger court_date_attendees_audit after insert or delete on public.court_date_attendees
  for each row execute function private.audit_court_date_attendee();

revoke all on function private.guard_court_date(), private.guard_court_date_attendee(),
  private.audit_court_date(), private.audit_court_date_attendee() from public;

-- ---------------------------------------------------------------------------
-- Calendrier Clio des dates de cour (paramètre du cabinet, choisi par le firm_admin)
-- ---------------------------------------------------------------------------
alter table private.integration_connections add column settings jsonb not null default '{}';

create or replace function public.clio_court_calendar()
returns bigint language sql stable security definer set search_path = '' as $$
  select case when private.is_staff()
              then (select (c.settings ->> 'court_calendar_id')::bigint from private.integration_connections c
                     where c.provider = 'clio_manage' and c.region = 'ca')
         end
$$;

create or replace function public.set_clio_court_calendar(p_calendar_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_firm_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_calendar_id is not null and p_calendar_id <= 0 then
    raise exception 'invalid calendar' using errcode = '23514';
  end if;
  insert into private.integration_connections (provider, region, settings)
    values ('clio_manage', 'ca', jsonb_build_object('court_calendar_id', p_calendar_id))
  on conflict (provider, region) do update
    set settings = private.integration_connections.settings || jsonb_build_object('court_calendar_id', p_calendar_id),
        updated_at = now();
  perform audit.record('integration.court_calendar_set', 'integration', 'clio_manage', null,
    jsonb_build_object('calendar_id', p_calendar_id));
end $$;

revoke all on function public.clio_court_calendar(), public.set_clio_court_calendar(bigint) from public, anon;
grant execute on function public.clio_court_calendar(), public.set_clio_court_calendar(bigint) to authenticated;
