-- Contrats, lot 1 (ADR 0032, stories F1, F2, F3) : section « Contrats » de l'espace cabinet,
-- rédaction dans la plateforme par sections, fiche du client copiée dans le contrat, verrou d'édition,
-- versions. Pas d'accès client à ce lot (les contrats envoyés arrivent au lot 3).
--
-- Qui voit un contrat : le personnel actif qui en est l'auteur, l'équipe du dossier lié, le firm_admin.
-- Qui le modifie : les mêmes, seulement en brouillon (ou en relecture), et seulement en tenant le verrou
-- (une personne à la fois, 5 minutes renouvelées par l'éditeur). Aucune suppression : on annule, avec motif.

-- ---------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------
create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) between 1 and 200 and title !~ '[[:cntrl:]]'),
  language        text not null default 'fr' check (language in ('fr', 'en')),
  status          text not null default 'draft'
                  check (status in ('draft', 'in_review', 'validated', 'sent', 'signed', 'declined', 'cancelled', 'superseded')),
  matter_id       uuid references public.matters(id) on delete restrict,
  -- Client existant (compte du portail), facultatif. Les coordonnées ci-dessous sont une COPIE propre au
  -- contrat : elles ne changent pas si la fiche du client change ensuite.
  client_id       uuid references public.profiles(id) on delete set null,
  client_name     text not null check (length(btrim(client_name)) between 1 and 200 and client_name !~ '[[:cntrl:]]'),
  client_email    text check (client_email is null
                              or (length(client_email) <= 254 and client_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Adresse sur plusieurs lignes : retours à la ligne permis, aucun autre caractère de contrôle.
  client_address  text check (client_address is null or (length(client_address) <= 500
                              and replace(client_address, chr(10), '') !~ '[[:cntrl:]]')),
  client_phone    text check (client_phone is null or (length(client_phone) <= 40 and client_phone ~ '^[0-9+(). -]*$')),
  client_language text not null default 'fr' check (client_language in ('fr', 'en')),
  created_by      uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  locked_by       uuid references public.profiles(id) on delete set null,
  locked_until    timestamptz,
  is_mock         boolean not null default false,
  cancel_reason   text check (cancel_reason is null or length(cancel_reason) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index contracts_matter_idx on public.contracts (matter_id);
create index contracts_created_by_idx on public.contracts (created_by);
create index contracts_updated_idx on public.contracts (updated_at desc);
create trigger contracts_updated_at before update on public.contracts
  for each row execute function private.set_updated_at();

-- Sections du contrat : contenu au format ProseMirror (JSON), validé par le serveur avant l'écriture
-- (types de nœuds permis) et rendu en éléments React, jamais en HTML brut.
create table public.contract_sections (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  position    smallint not null check (position between 0 and 199),
  title       text not null default '' check (length(title) <= 200 and title !~ '[[:cntrl:]]'),
  body        jsonb not null default '{"type": "doc", "content": []}'
              check (jsonb_typeof(body) = 'object' and body->>'type' = 'doc' and pg_column_size(body) <= 200000),
  ai_assisted boolean not null default false,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contract_sections_contract_idx on public.contract_sections (contract_id, position);
create trigger contract_sections_updated_at before update on public.contract_sections
  for each row execute function private.set_updated_at();

-- Versions enregistrées : copie complète (en-tête et sections) au moment de l'enregistrement.
create table public.contract_versions (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  version     int not null check (version >= 1),
  label       text check (label is null or (length(label) <= 120 and label !~ '[[:cntrl:]]')),
  snapshot    jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (contract_id, version)
);

-- ---------------------------------------------------------------------------------------------
-- 2. Droits
-- ---------------------------------------------------------------------------------------------
-- Lecture : personnel actif auteur, équipe du dossier lié, ou firm_admin.
create or replace function private.can_access_contract(p_matter uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff() and (
           private.is_firm_admin()
        or p_created_by = auth.uid()
        or (p_matter is not null and private.is_on_matter_team(p_matter)))
$$;

-- Écriture du contenu : accès, contrat en brouillon ou en relecture, verrou tenu par la personne.
create or replace function private.can_edit_contract(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and private.can_access_contract(c.matter_id, c.created_by)
       and c.status in ('draft', 'in_review')
       and c.locked_by = auth.uid() and c.locked_until > now())
$$;
revoke all on function private.can_access_contract(uuid, uuid), private.can_edit_contract(uuid) from public;
grant execute on function private.can_access_contract(uuid, uuid), private.can_edit_contract(uuid)
  to authenticated, service_role;

alter table public.contracts enable row level security;
alter table public.contract_sections enable row level security;
alter table public.contract_versions enable row level security;

create policy contracts_select on public.contracts for select to authenticated
  using (private.can_access_contract(matter_id, created_by));
-- L'auteur est imposé par le garde-fou (avant la vérification de la politique).
create policy contracts_insert on public.contracts for insert to authenticated
  with check (private.is_staff() and created_by = auth.uid()
              and (matter_id is null or private.is_firm_admin() or private.is_on_matter_team(matter_id)));
create policy contracts_update on public.contracts for update to authenticated
  using (private.can_access_contract(matter_id, created_by))
  with check (private.can_access_contract(matter_id, created_by)
              and (matter_id is null or private.is_firm_admin() or private.is_on_matter_team(matter_id)));

create policy contract_sections_select on public.contract_sections for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id
                  and private.can_access_contract(c.matter_id, c.created_by)));
create policy contract_sections_insert on public.contract_sections for insert to authenticated
  with check (private.can_edit_contract(contract_id));
create policy contract_sections_update on public.contract_sections for update to authenticated
  using (private.can_edit_contract(contract_id)) with check (private.can_edit_contract(contract_id));
create policy contract_sections_delete on public.contract_sections for delete to authenticated
  using (private.can_edit_contract(contract_id));

create policy contract_versions_select on public.contract_versions for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id
                  and private.can_access_contract(c.matter_id, c.created_by)));

-- Droits par colonne : le verrou, l'auteur et l'état de démonstration ne s'écrivent jamais directement.
revoke all on public.contracts, public.contract_sections, public.contract_versions from anon, authenticated;
grant select on public.contracts, public.contract_sections, public.contract_versions to authenticated;
grant insert (id, title, language, matter_id, client_id, client_name, client_email, client_address, client_phone,
              client_language)
  on public.contracts to authenticated;
grant update (title, language, matter_id, client_id, client_name, client_email, client_address, client_phone,
              client_language, status, cancel_reason)
  on public.contracts to authenticated;
grant insert (id, contract_id, position, title, body, ai_assisted) on public.contract_sections to authenticated;
grant update (position, title, body, ai_assisted) on public.contract_sections to authenticated;
grant delete on public.contract_sections to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Garde-fous
-- ---------------------------------------------------------------------------------------------
create or replace function private.guard_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.is_mock := false;
    end if;
    new.status := 'draft';
    new.cancel_reason := null;
    -- L'auteur tient le verrou dès la création (il remplit les sections tout de suite).
    new.locked_by := new.created_by;
    new.locked_until := now() + interval '5 minutes';
  else
    if new.created_by <> old.created_by or new.is_mock <> old.is_mock then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    -- Seul le verrou change (fonctions de verrou) : rien d'autre à vérifier.
    if (to_jsonb(new) - array['locked_by', 'locked_until', 'updated_at'])
       is not distinct from (to_jsonb(old) - array['locked_by', 'locked_until', 'updated_at']) then
      return new;
    end if;
    if auth.uid() is not null then
      if old.status not in ('draft', 'in_review') then
        raise exception 'contract not editable' using errcode = '23514';
      end if;
      if not (old.locked_by = auth.uid() and old.locked_until > now()) then
        raise exception 'contract locked' using errcode = '55006';
      end if;
      -- Validation et envoi : lot 3 (fonctions dédiées). Ici : brouillon, relecture ou annulation.
      if new.status not in ('draft', 'in_review', 'cancelled') then
        raise exception 'invalid status' using errcode = '23514';
      end if;
    end if;
  end if;
  if new.status = 'cancelled' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'cancel reason required' using errcode = '23514';
    end if;
    new.locked_by := null;
    new.locked_until := null;
  else
    new.cancel_reason := null;
  end if;
  -- Client existant : un vrai client, visible de la personne (pas d'identifiant arbitraire).
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    if not exists (select 1 from public.profiles p where p.id = new.client_id and p.role = 'client')
       or (auth.uid() is not null and not private.can_see_profile(new.client_id)) then
      raise exception 'invalid client' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger contracts_guard before insert or update on public.contracts
  for each row execute function private.guard_contract();

create or replace function private.guard_contract_section()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.contract_id <> old.contract_id then
    raise exception 'immutable column' using errcode = '23514';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger contract_sections_guard before insert or update on public.contract_sections
  for each row execute function private.guard_contract_section();

-- Journal : création et changements de statut (jamais le contenu ni les coordonnées du client).
create or replace function private.audit_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('contract.created', 'contract', new.id::text, new.matter_id,
                         jsonb_build_object('language', new.language, 'existing_client', new.client_id is not null));
  elsif new.status is distinct from old.status then
    perform audit.record('contract.' || new.status, 'contract', new.id::text, new.matter_id, '{}'::jsonb);
  elsif new.matter_id is distinct from old.matter_id then
    perform audit.record('contract.matter_linked', 'contract', new.id::text, new.matter_id, '{}'::jsonb);
  end if;
  return null;
end $$;
create trigger contracts_audit after insert or update on public.contracts
  for each row execute function private.audit_contract();

revoke all on function private.guard_contract(), private.guard_contract_section(), private.audit_contract() from public;

-- ---------------------------------------------------------------------------------------------
-- 4. Verrou d'édition et versions (fonctions à droits vérifiés)
-- ---------------------------------------------------------------------------------------------
-- Prendre ou renouveler le verrou (5 minutes). Renvoie qui le tient si quelqu'un d'autre l'a.
create or replace function public.contract_acquire_lock(p_contract uuid)
returns table (acquired boolean, holder uuid, holder_name text, until timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status not in ('draft', 'in_review') then
    return query select false, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if v.locked_by is null or v.locked_until <= now() or v.locked_by = auth.uid() then
    update public.contracts c set locked_by = auth.uid(), locked_until = now() + interval '5 minutes'
     where c.id = p_contract;
    return query select true, auth.uid(), null::text, now() + interval '5 minutes';
  else
    return query select false, v.locked_by,
      (select nullif(btrim(concat_ws(' ', p.title, p.first_name, p.last_name)), '') from public.profiles p where p.id = v.locked_by),
      v.locked_until;
  end if;
end $$;

create or replace function public.contract_release_lock(p_contract uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.contracts c set locked_by = null, locked_until = null
   where c.id = p_contract and c.locked_by = auth.uid()
$$;

-- Enregistrer une version (verrou requis) : copie de l'en-tête et des sections.
create or replace function public.contract_save_version(p_contract uuid, p_label text default null)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v_version int; v_matter uuid;
begin
  if not private.can_edit_contract(p_contract) then
    raise exception 'not editable' using errcode = '42501';
  end if;
  if p_label is not null and (length(p_label) > 120 or p_label ~ '[[:cntrl:]]') then
    raise exception 'invalid label' using errcode = '22023';
  end if;
  select c.matter_id into v_matter from public.contracts c where c.id = p_contract;
  select coalesce(max(cv.version), 0) + 1 into v_version from public.contract_versions cv where cv.contract_id = p_contract;
  insert into public.contract_versions (contract_id, version, label, snapshot, created_by)
  select c.id, v_version, nullif(btrim(p_label), ''),
         jsonb_build_object(
           'title', c.title, 'language', c.language, 'matter_id', c.matter_id, 'client_id', c.client_id,
           'client_name', c.client_name, 'client_email', c.client_email, 'client_address', c.client_address,
           'client_phone', c.client_phone, 'client_language', c.client_language,
           'sections', coalesce((select jsonb_agg(jsonb_build_object('position', s.position, 'title', s.title,
                                                                     'body', s.body, 'ai_assisted', s.ai_assisted)
                                                  order by s.position)
                                   from public.contract_sections s where s.contract_id = c.id), '[]'::jsonb)),
         auth.uid()
    from public.contracts c where c.id = p_contract;
  perform audit.record('contract.version_saved', 'contract', p_contract::text, v_matter,
                       jsonb_build_object('version', v_version));
  return v_version;
end $$;

-- Revenir à une version (verrou requis) : les sections actuelles sont remplacées par celles de la version.
-- La version courante est d'abord enregistrée, pour ne rien perdre.
create or replace function public.contract_restore_version(p_contract uuid, p_version int)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v_snapshot jsonb; v_saved int; v_matter uuid;
begin
  if not private.can_edit_contract(p_contract) then
    raise exception 'not editable' using errcode = '42501';
  end if;
  select cv.snapshot into v_snapshot from public.contract_versions cv
   where cv.contract_id = p_contract and cv.version = p_version;
  if v_snapshot is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_saved := public.contract_save_version(p_contract, 'Avant retour à la version ' || p_version);
  delete from public.contract_sections s where s.contract_id = p_contract;
  insert into public.contract_sections (contract_id, position, title, body, ai_assisted)
  select p_contract, (e->>'position')::smallint, coalesce(e->>'title', ''), e->'body', coalesce((e->>'ai_assisted')::boolean, false)
    from jsonb_array_elements(v_snapshot->'sections') e;
  update public.contracts c
     set title = v_snapshot->>'title', client_name = v_snapshot->>'client_name',
         client_email = v_snapshot->>'client_email', client_address = v_snapshot->>'client_address',
         client_phone = v_snapshot->>'client_phone'
   where c.id = p_contract
  returning c.matter_id into v_matter;
  perform audit.record('contract.version_restored', 'contract', p_contract::text, v_matter,
                       jsonb_build_object('version', p_version, 'saved_before', v_saved));
  return v_saved;
end $$;

revoke all on function public.contract_acquire_lock(uuid), public.contract_release_lock(uuid),
  public.contract_save_version(uuid, text), public.contract_restore_version(uuid, int) from public, anon;
grant execute on function public.contract_acquire_lock(uuid), public.contract_release_lock(uuid),
  public.contract_save_version(uuid, text), public.contract_restore_version(uuid, int) to authenticated;

-- Un courriel est-il déjà connu (client existant) ? Personnel seulement ; réponse oui ou non.
create or replace function public.contract_client_email_known(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff() and exists (
    select 1 from public.profiles p where lower(p.email) = lower(btrim(p_email)) and p.role = 'client')
$$;
revoke all on function public.contract_client_email_known(text) from public, anon;
grant execute on function public.contract_client_email_known(text) to authenticated;
