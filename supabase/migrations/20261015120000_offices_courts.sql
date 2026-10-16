-- ============================================================================
-- Bureaux et tribunaux (ADR 0024, plan « bureaux et calendrier de cour », lot 1).
--  1. public.offices : bureaux du cabinet (Ottawa, Halifax, Montréal ; décision du 2026-10-15).
--  2. public.courts : liste des tribunaux (liste de départ à valider par le cabinet).
--  3. public.staff_offices : personnel rattaché aux bureaux (un bureau principal au plus).
--  4. public.matters.office_id : bureau du dossier.
-- Le bureau ne donne AUCUN droit : l'accès aux dossiers reste celui de l'équipe (ADR 0024).
-- Lecture : personnel seulement ; écriture : firm_admin ; jamais de suppression (archivage).
-- ============================================================================

create table public.offices (
  id         uuid primary key default gen_random_uuid(),
  name_fr    text not null check (length(btrim(name_fr)) between 1 and 80),
  name_en    text not null check (length(btrim(name_en)) between 1 and 80),
  city       text not null check (length(btrim(city)) between 1 and 80),
  province   text not null check (province in ('NS', 'NB', 'PE', 'NL', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU')),
  timezone   text not null check (timezone in ('America/St_Johns', 'America/Halifax', 'America/Toronto',
                                               'America/Winnipeg', 'America/Regina', 'America/Edmonton',
                                               'America/Vancouver', 'America/Whitehorse')),
  address    text check (address is null or length(address) <= 300),
  position   smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index offices_name_fr_key on public.offices (lower(btrim(name_fr)));
create unique index offices_name_en_key on public.offices (lower(btrim(name_en)));
create trigger offices_updated_at before update on public.offices
  for each row execute function private.set_updated_at();

create table public.courts (
  id         uuid primary key default gen_random_uuid(),
  name_fr    text not null check (length(btrim(name_fr)) between 1 and 150),
  name_en    text not null check (length(btrim(name_en)) between 1 and 150),
  -- FED : tribunal fédéral (siège selon l'audience).
  province   text not null check (province in ('NS', 'NB', 'PE', 'NL', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU', 'FED')),
  timezone   text check (timezone is null or timezone in ('America/St_Johns', 'America/Halifax', 'America/Toronto',
                                               'America/Winnipeg', 'America/Regina', 'America/Edmonton',
                                               'America/Vancouver', 'America/Whitehorse')),
  address    text check (address is null or length(address) <= 300),
  position   smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un tribunal provincial a toujours un fuseau ; un tribunal fédéral prend celui de l'audience.
  check (province = 'FED' or timezone is not null)
);
create unique index courts_name_fr_key on public.courts (lower(btrim(name_fr)));
create unique index courts_name_en_key on public.courts (lower(btrim(name_en)));
create trigger courts_updated_at before update on public.courts
  for each row execute function private.set_updated_at();

create table public.staff_offices (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  office_id  uuid not null references public.offices(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, office_id)
);
create unique index staff_offices_one_primary on public.staff_offices (user_id) where is_primary;
create index staff_offices_office_idx on public.staff_offices (office_id);

alter table public.matters add column office_id uuid references public.offices(id) on delete restrict;
create index matters_office_idx on public.matters (office_id);
grant select (office_id) on public.matters to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.offices enable row level security;
alter table public.courts enable row level security;
alter table public.staff_offices enable row level security;

create policy offices_select on public.offices for select to authenticated using (private.is_staff());
create policy offices_admin_insert on public.offices for insert to authenticated with check (private.is_firm_admin());
create policy offices_admin_update on public.offices for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

create policy courts_select on public.courts for select to authenticated using (private.is_staff());
create policy courts_admin_insert on public.courts for insert to authenticated with check (private.is_firm_admin());
create policy courts_admin_update on public.courts for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());

create policy staff_offices_select on public.staff_offices for select to authenticated using (private.is_staff());
create policy staff_offices_admin_insert on public.staff_offices for insert to authenticated
  with check (private.is_firm_admin());
create policy staff_offices_admin_update on public.staff_offices for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy staff_offices_admin_delete on public.staff_offices for delete to authenticated
  using (private.is_firm_admin());

-- Pas de suppression des bureaux ni des tribunaux : on archive (is_active = false).
grant select, insert, update on public.offices, public.courts to authenticated;
grant select, insert, update, delete on public.staff_offices to authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fous
-- ---------------------------------------------------------------------------
-- Seul un membre du personnel actif peut être rattaché à un bureau, et pas à un bureau archivé.
create or replace function private.guard_staff_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = new.user_id and p.role in ('staff', 'firm_admin')) then
    raise exception 'not a staff member' using errcode = '23514';
  end if;
  if not exists (select 1 from public.offices o where o.id = new.office_id and o.is_active) then
    raise exception 'office archived' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger staff_offices_guard before insert or update on public.staff_offices
  for each row execute function private.guard_staff_office();

-- Un dossier ne peut être placé que dans un bureau actif.
create or replace function private.guard_matter_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.office_id is not null and new.office_id is distinct from old.office_id
     and not exists (select 1 from public.offices o where o.id = new.office_id and o.is_active) then
    raise exception 'office archived' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger matters_office_guard before update of office_id on public.matters
  for each row execute function private.guard_matter_office();

-- ---------------------------------------------------------------------------
-- Journal (identifiants seulement)
-- ---------------------------------------------------------------------------
create or replace function private.audit_office_court()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := case tg_table_name when 'offices' then 'office' else 'court' end;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := v_prefix || '.created';
  elsif new.is_active is distinct from old.is_active then
    v_action := v_prefix || case when new.is_active then '.restored' else '.archived' end;
  else
    v_action := v_prefix || '.updated';
  end if;
  perform audit.record(v_action, v_prefix, new.id::text, null, '{}');
  return null;
end $$;
create trigger offices_audit after insert or update on public.offices
  for each row execute function private.audit_office_court();
create trigger courts_audit after insert or update on public.courts
  for each row execute function private.audit_office_court();

create or replace function private.audit_staff_office()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.staff_offices := coalesce(new, old);
begin
  perform audit.record('office.staff_' || lower(tg_op), 'office', v_row.office_id::text, null,
    jsonb_build_object('user_id', v_row.user_id, 'is_primary', v_row.is_primary));
  return null;
end $$;
create trigger staff_offices_audit after insert or update or delete on public.staff_offices
  for each row execute function private.audit_staff_office();

create or replace function private.audit_matter_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.office_id is distinct from old.office_id then
    perform audit.record('matter.office_set', 'matter', new.id::text, new.id,
      jsonb_build_object('office_id', new.office_id));
  end if;
  return null;
end $$;
create trigger matters_office_audit after update of office_id on public.matters
  for each row execute function private.audit_matter_office();

revoke all on function private.guard_staff_office(), private.guard_matter_office(),
  private.audit_office_court(), private.audit_staff_office(), private.audit_matter_office() from public;

-- ---------------------------------------------------------------------------
-- Données de départ
-- ---------------------------------------------------------------------------
-- Bureaux décidés par le cabinet le 2026-10-15 (adresses à fournir).
insert into public.offices (name_fr, name_en, city, province, timezone, position) values
  ('Ottawa', 'Ottawa', 'Ottawa', 'ON', 'America/Toronto', 1),
  ('Halifax', 'Halifax', 'Halifax', 'NS', 'America/Halifax', 2),
  ('Montréal', 'Montreal', 'Montréal', 'QC', 'America/Toronto', 3);

-- Tribunaux : liste de départ, à valider et compléter par le cabinet.
insert into public.courts (name_fr, name_en, province, timezone, position) values
  ('Cour suprême de la Nouvelle-Écosse', 'Supreme Court of Nova Scotia', 'NS', 'America/Halifax', 1),
  ('Cour provinciale de la Nouvelle-Écosse', 'Provincial Court of Nova Scotia', 'NS', 'America/Halifax', 2),
  ('Cour d''appel de la Nouvelle-Écosse', 'Nova Scotia Court of Appeal', 'NS', 'America/Halifax', 3),
  ('Cour supérieure de justice de l''Ontario', 'Ontario Superior Court of Justice', 'ON', 'America/Toronto', 4),
  ('Cour de justice de l''Ontario', 'Ontario Court of Justice', 'ON', 'America/Toronto', 5),
  ('Cour d''appel de l''Ontario', 'Court of Appeal for Ontario', 'ON', 'America/Toronto', 6),
  ('Cour supérieure du Québec', 'Superior Court of Québec', 'QC', 'America/Toronto', 7),
  ('Cour du Québec', 'Court of Québec', 'QC', 'America/Toronto', 8),
  ('Cour d''appel du Québec', 'Court of Appeal of Québec', 'QC', 'America/Toronto', 9),
  ('Tribunal administratif du Québec', 'Administrative Tribunal of Québec', 'QC', 'America/Toronto', 10),
  ('Cour fédérale', 'Federal Court', 'FED', null, 11),
  ('Cour d''appel fédérale', 'Federal Court of Appeal', 'FED', null, 12),
  ('Commission de l''immigration et du statut de réfugié (CISR)', 'Immigration and Refugee Board (IRB)', 'FED', null, 13);
