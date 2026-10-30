-- Clio (ADR 0038) : corrections de la revue de sécurité du 2026-10-28.
--  1. court_date_import_clio : verrou par entrée Clio (un import manuel et le planificateur en même
--     temps ne créent pas deux dates).
--  2. contract_deposit_retry : relance journalisée (contract.deposit_retried).
--  3. contract_deposit_claim : un dépôt sans PDF est quand même renvoyé (il échoue proprement au lieu
--     de rester réservé sans fin).

-- 1 ------------------------------------------------------------------------------------------
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
  -- Une entrée à la fois : la vérification « déjà importée » et la création ne se chevauchent pas.
  perform pg_advisory_xact_lock(hashtext('clio_entry:' || p_entry_id));
  if exists (select 1 from public.court_dates cd where cd.clio_calendar_entry_id = p_entry_id) then
    return null; -- déjà importée
  end if;
  insert into public.court_dates (matter_id, kind, starts_at, ends_at, all_day, timezone, status, source)
  values (p_matter, p_kind, p_starts_at, p_ends_at, coalesce(p_all_day, false), p_timezone, 'scheduled', 'clio')
  returning id into v_id;
  update public.court_dates cd
     set clio_calendar_entry_id = p_entry_id, clio_sync_status = 'synced', clio_synced_at = now()
   where cd.id = v_id;
  perform audit.record('court_date.imported_from_clio', 'court_date', v_id::text, p_matter, '{}'::jsonb);
  return v_id;
end $$;

-- 2 ------------------------------------------------------------------------------------------
create or replace function public.contract_deposit_retry(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_contract uuid; v_matter uuid;
begin
  update public.contract_deposits d
     set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
   where d.id = p_id and d.status = 'failed' and d.target = 'clio'
     and exists (select 1 from public.contracts c where c.id = d.contract_id
                  and private.can_access_contract(c.matter_id, c.created_by))
  returning d.contract_id into v_contract;
  if v_contract is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select c.matter_id into v_matter from public.contracts c where c.id = v_contract;
  perform audit.record('contract.deposit_retried', 'contract', v_contract::text, v_matter, '{}'::jsonb);
end $$;

-- 3 ------------------------------------------------------------------------------------------
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
    left join public.matters m on m.id = c.matter_id
    left join private.contract_pdfs p on p.contract_id = cl.contract_id and p.version = cl.version;
end $$;

revoke all on function public.contract_deposit_claim(int) from public, anon, authenticated;
grant execute on function public.contract_deposit_claim(int) to service_role;
