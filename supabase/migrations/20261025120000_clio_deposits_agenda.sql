-- Clio : dépôt du contrat validé (F11, partie Clio) et dates de cour venues de Clio (E8, E16). ADR 0038.
--  1. public.contract_deposits : état du dépôt de chaque version validée, par destination (Clio,
--     SharePoint). Créé par la base à la validation ; Clio « à faire » si le dossier est lié à Clio,
--     SharePoint « en attente du branchement Microsoft ». Lecture : équipe du contrat. Jamais écrit
--     par l'utilisateur ; le planificateur (service_role, usage permis : synchronisation) le traite.
--  2. contract_deposit_claim / contract_deposit_result : le planificateur réserve les dépôts à faire
--     (avec le PDF officiel), puis enregistre le résultat. Nouvelle tentative avec délai croissant ;
--     « échec » après 5 essais, signalé dans « À surveiller ». Le personnel peut relancer.
--  3. court_dates.source (« portal » ou « clio ») et public.court_date_import_clio : une entrée
--     d'agenda Clio devient une date de cour « à confirmer », déjà liée à Clio (jamais recréée dans Clio).
--  4. private.clio_agenda_cursor : dernier passage de l'import automatique, par dossier.

-- 1 ------------------------------------------------------------------------------------------
create table public.contract_deposits (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete restrict,
  version       int not null check (version >= 1),
  target        text not null check (target in ('clio', 'sharepoint')),
  status        text not null default 'pending' check (status in ('pending', 'done', 'failed', 'waiting')),
  external_id   text check (external_id is null or length(external_id) <= 100),
  attempts      int not null default 0 check (attempts >= 0),
  last_error    text check (last_error is null or last_error ~ '^[A-Z_]{2,40}$'),
  next_attempt_at timestamptz not null default now(),
  deposited_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contract_id, version, target)
);
create index contract_deposits_todo_idx on public.contract_deposits (next_attempt_at) where status = 'pending';
alter table public.contract_deposits enable row level security;
create policy contract_deposits_select on public.contract_deposits for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id
                  and private.can_access_contract(c.matter_id, c.created_by)));
revoke all on public.contract_deposits from anon, authenticated;
grant select on public.contract_deposits to authenticated;

-- À la validation : une ligne par destination.
create or replace function private.queue_contract_deposits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_clio text;
begin
  if new.status = 'validated' and old.status is distinct from 'validated' and new.validated_version is not null
     and not new.template_draft then
    select m.clio_matter_id into v_clio from public.matters m where m.id = new.matter_id;
    insert into public.contract_deposits (contract_id, version, target, status, last_error)
    values (new.id, new.validated_version, 'clio',
            case when v_clio is null then 'waiting' else 'pending' end,
            case when v_clio is null then 'NO_CLIO_MATTER' end),
           (new.id, new.validated_version, 'sharepoint', 'waiting', 'MICROSOFT_PENDING')
    on conflict (contract_id, version, target) do nothing;
  end if;
  return null;
end $$;
revoke all on function private.queue_contract_deposits() from public;
create trigger contracts_queue_deposits after update of status on public.contracts
  for each row execute function private.queue_contract_deposits();

-- 2 ------------------------------------------------------------------------------------------
-- Planificateur (service_role seulement) : dépôts Clio à faire, avec le PDF et le document Clio
-- précédent du même contrat (ou de la version qu'il remplace) pour en faire une nouvelle version.
create or replace function public.contract_deposit_claim(p_limit int default 10)
returns table (id uuid, contract_id uuid, version int, clio_matter_id text, file_name text,
               pdf_base64 text, previous_document_id text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  return query
  with todo as (
    select d.id from public.contract_deposits d
     where d.target = 'clio' and d.status = 'pending' and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit least(greatest(coalesce(p_limit, 10), 1), 50)
     for update skip locked
  ), claimed as (
    update public.contract_deposits d
       set attempts = d.attempts + 1,
           -- Délai croissant avant la prochaine tentative : 5, 20, 45, 80 minutes…
           next_attempt_at = now() + make_interval(mins => 5 * (d.attempts + 1) * (d.attempts + 1)),
           updated_at = now()
      from todo where d.id = todo.id
    returning d.id, d.contract_id, d.version
  )
  select cl.id, cl.contract_id, cl.version, m.clio_matter_id,
         left(regexp_replace(c.title, '[^[:alnum:] ._-]', '', 'g'), 120) || ' - v' || cl.version || '.pdf',
         encode(p.pdf, 'base64'),
         (select prev.external_id from public.contract_deposits prev
           where prev.target = 'clio' and prev.status = 'done' and prev.external_id is not null
             and prev.contract_id in (c.id, c.previous_id)
           order by prev.deposited_at desc limit 1)
    from claimed cl
    join public.contracts c on c.id = cl.contract_id
    join public.matters m on m.id = c.matter_id
    join private.contract_pdfs p on p.contract_id = cl.contract_id and p.version = cl.version;
end $$;

create or replace function public.contract_deposit_result(p_id uuid, p_ok boolean, p_external_id text, p_error text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contract_deposits%rowtype; v_matter uuid;
begin
  select * into v from public.contract_deposits d where d.id = p_id for update;
  if not found then
    return;
  end if;
  select c.matter_id into v_matter from public.contracts c where c.id = v.contract_id;
  if p_ok then
    update public.contract_deposits d
       set status = 'done', external_id = left(p_external_id, 100), last_error = null, deposited_at = now(),
           updated_at = now()
     where d.id = p_id;
    perform audit.record('contract.deposited', 'contract', v.contract_id::text, v_matter,
                         jsonb_build_object('target', v.target, 'version', v.version));
  else
    update public.contract_deposits d
       set status = case when d.attempts >= 5 then 'failed' else 'pending' end,
           last_error = case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'UPSTREAM' end,
           updated_at = now()
     where d.id = p_id;
    if v.attempts >= 5 then
      perform audit.record('contract.deposit_failed', 'contract', v.contract_id::text, v_matter,
                           jsonb_build_object('target', v.target, 'version', v.version));
    end if;
  end if;
end $$;

-- Relance manuelle d'un dépôt en échec (équipe du contrat).
create or replace function public.contract_deposit_retry(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.contract_deposits d
     set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
   where d.id = p_id and d.status = 'failed' and d.target = 'clio'
     and exists (select 1 from public.contracts c where c.id = d.contract_id
                  and private.can_access_contract(c.matter_id, c.created_by));
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end $$;

-- 3 ------------------------------------------------------------------------------------------
alter table public.court_dates
  add column source text not null default 'portal' check (source in ('portal', 'clio'));
create unique index court_dates_clio_entry_key on public.court_dates (clio_calendar_entry_id)
  where clio_calendar_entry_id is not null;

-- Import d'une entrée d'agenda Clio : par l'équipe du dossier (bouton « Importer ») ou par le
-- planificateur (service_role). La date arrive « à confirmer », déjà liée à son entrée Clio.
create or replace function public.court_date_import_clio(p_matter uuid, p_entry_id text, p_kind text,
                                                         p_starts_at timestamptz, p_ends_at timestamptz,
                                                         p_all_day boolean, p_timezone text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is not null then
    if not (private.is_firm_admin() or private.is_on_matter_team(p_matter)) then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  elsif coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_entry_id is null or p_entry_id !~ '^[0-9]{1,20}$' then
    raise exception 'invalid entry' using errcode = '22023';
  end if;
  if exists (select 1 from public.court_dates cd where cd.clio_calendar_entry_id = p_entry_id) then
    return null; -- déjà importée
  end if;
  insert into public.court_dates (matter_id, kind, starts_at, ends_at, all_day, timezone, status, source)
  values (p_matter, p_kind, p_starts_at, p_ends_at, coalesce(p_all_day, false), p_timezone, 'scheduled', 'clio')
  returning id into v_id;
  -- Lien à Clio posé après la création (le garde-fou l'efface à l'insertion) : jamais recréée dans Clio.
  update public.court_dates cd
     set clio_calendar_entry_id = p_entry_id, clio_sync_status = 'synced', clio_synced_at = now()
   where cd.id = v_id;
  perform audit.record('court_date.imported_from_clio', 'court_date', v_id::text, p_matter, '{}'::jsonb);
  return v_id;
end $$;

-- 4 ------------------------------------------------------------------------------------------
create table private.clio_agenda_cursor (
  matter_id       uuid primary key references public.matters(id) on delete cascade,
  last_pulled_at  timestamptz not null
);
alter table private.clio_agenda_cursor enable row level security;

-- Planificateur : prochains dossiers liés à Clio à relire (les plus anciens d'abord), puis curseur.
create or replace function public.clio_agenda_next(p_limit int default 20)
returns table (matter_id uuid, clio_matter_id text, office_timezone text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.clio_matter_id, o.timezone, c.last_pulled_at
    from public.matters m
    left join public.offices o on o.id = m.office_id
    left join private.clio_agenda_cursor c on c.matter_id = m.id
   where m.clio_matter_id is not null and m.status = 'open'
   order by c.last_pulled_at nulls first
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

create or replace function public.clio_agenda_mark(p_matter uuid, p_at timestamptz)
returns void language sql volatile security definer set search_path = '' as $$
  insert into private.clio_agenda_cursor (matter_id, last_pulled_at) values (p_matter, p_at)
  on conflict (matter_id) do update set last_pulled_at = excluded.last_pulled_at
$$;

revoke all on function public.contract_deposit_claim(int), public.contract_deposit_result(uuid, boolean, text, text),
  public.clio_agenda_next(int), public.clio_agenda_mark(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.contract_deposit_claim(int), public.contract_deposit_result(uuid, boolean, text, text),
  public.clio_agenda_next(int), public.clio_agenda_mark(uuid, timestamptz) to service_role;
revoke all on function public.contract_deposit_retry(uuid),
  public.court_date_import_clio(uuid, text, text, timestamptz, timestamptz, boolean, text) from public, anon;
grant execute on function public.contract_deposit_retry(uuid) to authenticated;
grant execute on function public.court_date_import_clio(uuid, text, text, timestamptz, timestamptz, boolean, text)
  to authenticated, service_role;
