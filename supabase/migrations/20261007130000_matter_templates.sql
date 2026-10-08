-- ============================================================================
-- Modèles de dossiers (ADR 0019) : types de dossier repris de lexcanadalaw.com/expertise,
-- étapes types, documents types et champs personnalisés, gérés par le firm_admin.
--  1. public.matter_types (+ steps, documents, fields) : lecture par le personnel ; écriture firm_admin.
--     Les libellés des champs VISIBLES par le client lui sont lisibles (sans donnée de dossier).
--  2. public.matters.matter_type_id : type choisi par l'équipe du dossier (politique existante).
--  3. public.matter_field_values : valeurs par dossier ; écriture : équipe ou firm_admin ;
--     lecture client : seulement les champs marqués visibles, sur un dossier lisible.
--  4. Version anglaise des étapes et des demandes de documents (title_en, description_en) :
--     le client voit chaque élément dans sa langue quand il vient d'un modèle.
--  5. Demandes de documents : le destinataire doit avoir un accès client actif au dossier ;
--     création et changements de statut journalisés (identifiants seulement).
-- Le contenu des modèles (fin de fichier) est une PREMIÈRE VERSION À VALIDER PAR LE CABINET.
-- ============================================================================

-- 1. Types de dossier et modèles -----------------------------------------------
create table public.matter_types (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9_]{2,60}$'),
  practice_group text not null check (practice_group in ('legal', 'business', 'advisory')),
  name_fr        text not null check (length(btrim(name_fr)) between 1 and 200),
  name_en        text not null check (length(btrim(name_en)) between 1 and 200),
  position       smallint not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2. Type d'un dossier (créé ici : les règles des champs s'y réfèrent) ------------------------------------------------------------
alter table public.matters add column matter_type_id uuid references public.matter_types(id) on delete set null;
create index matters_type_idx on public.matters (matter_type_id);
-- Colonne lisible par l'API (la lecture de matters est accordée colonne par colonne, ADR 0009).
grant select (matter_type_id) on public.matters to authenticated;

create table public.matter_type_steps (
  id             uuid primary key default gen_random_uuid(),
  matter_type_id uuid not null references public.matter_types(id) on delete cascade,
  position       smallint not null,
  title_fr       text not null check (length(btrim(title_fr)) between 1 and 200),
  title_en       text not null check (length(btrim(title_en)) between 1 and 200),
  description_fr text check (length(description_fr) <= 1000),
  description_en text check (length(description_en) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index matter_type_steps_type_idx on public.matter_type_steps (matter_type_id, position);

create table public.matter_type_documents (
  id             uuid primary key default gen_random_uuid(),
  matter_type_id uuid not null references public.matter_types(id) on delete cascade,
  position       smallint not null,
  title_fr       text not null check (length(btrim(title_fr)) between 1 and 200),
  title_en       text not null check (length(btrim(title_en)) between 1 and 200),
  description_fr text check (length(description_fr) <= 1000),
  description_en text check (length(description_en) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index matter_type_documents_type_idx on public.matter_type_documents (matter_type_id, position);

create table public.matter_type_fields (
  id                uuid primary key default gen_random_uuid(),
  matter_type_id    uuid not null references public.matter_types(id) on delete cascade,
  position          smallint not null,
  label_fr          text not null check (length(btrim(label_fr)) between 1 and 120),
  label_en          text not null check (length(btrim(label_en)) between 1 and 120),
  kind              text not null default 'text' check (kind in ('text', 'date', 'number')),
  visible_to_client boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index matter_type_fields_type_idx on public.matter_type_fields (matter_type_id, position);

-- updated_at tenu par la base (même fonction que les autres tables).
create trigger matter_types_updated_at before update on public.matter_types
  for each row execute function private.set_updated_at();
create trigger matter_type_steps_updated_at before update on public.matter_type_steps
  for each row execute function private.set_updated_at();
create trigger matter_type_documents_updated_at before update on public.matter_type_documents
  for each row execute function private.set_updated_at();
create trigger matter_type_fields_updated_at before update on public.matter_type_fields
  for each row execute function private.set_updated_at();

alter table public.matter_types enable row level security;
alter table public.matter_type_steps enable row level security;
alter table public.matter_type_documents enable row level security;
alter table public.matter_type_fields enable row level security;

create policy matter_types_staff_select on public.matter_types for select to authenticated
  using (private.is_staff());
create policy matter_types_admin_insert on public.matter_types for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_types_admin_update on public.matter_types for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy matter_types_admin_delete on public.matter_types for delete to authenticated
  using (private.is_firm_admin());

create policy matter_type_steps_staff_select on public.matter_type_steps for select to authenticated
  using (private.is_staff());
create policy matter_type_steps_admin_insert on public.matter_type_steps for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_type_steps_admin_update on public.matter_type_steps for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy matter_type_steps_admin_delete on public.matter_type_steps for delete to authenticated
  using (private.is_firm_admin());

create policy matter_type_documents_staff_select on public.matter_type_documents for select to authenticated
  using (private.is_staff());
create policy matter_type_documents_admin_insert on public.matter_type_documents for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_type_documents_admin_update on public.matter_type_documents for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy matter_type_documents_admin_delete on public.matter_type_documents for delete to authenticated
  using (private.is_firm_admin());

-- Libellés des champs : personnel ; client = seulement les champs visibles d'un type
-- utilisé par un dossier qu'il peut lire.
create policy matter_type_fields_select on public.matter_type_fields for select to authenticated
  using (private.is_staff()
         or (visible_to_client and exists (
               select 1 from public.matters m
                where m.matter_type_id = matter_type_fields.matter_type_id
                  and private.can_read_matter(m.id))));
create policy matter_type_fields_admin_insert on public.matter_type_fields for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_type_fields_admin_update on public.matter_type_fields for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy matter_type_fields_admin_delete on public.matter_type_fields for delete to authenticated
  using (private.is_firm_admin());

grant select, insert, update, delete on public.matter_types, public.matter_type_steps,
  public.matter_type_documents, public.matter_type_fields to authenticated;

-- 3. Valeurs des champs par dossier -----------------------------------------------
create table public.matter_field_values (
  matter_id  uuid not null references public.matters(id) on delete cascade,
  field_id   uuid not null references public.matter_type_fields(id) on delete cascade,
  value      text not null check (length(value) <= 500),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (matter_id, field_id)
);
create index matter_field_values_field_idx on public.matter_field_values (field_id);

create trigger matter_field_values_updated_at before update on public.matter_field_values
  for each row execute function private.set_updated_at();

-- Un champ ne peut recevoir de valeur que pour un dossier du même type.
create or replace function private.guard_matter_field_value()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.matter_type_fields f
      join public.matters m on m.matter_type_id = f.matter_type_id
     where f.id = new.field_id and m.id = new.matter_id) then
    raise exception 'Ce champ ne correspond pas au type du dossier' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger matter_field_values_guard before insert or update on public.matter_field_values
  for each row execute function private.guard_matter_field_value();

alter table public.matter_field_values enable row level security;
create policy matter_field_values_select on public.matter_field_values for select to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id)
         or (not private.is_staff() and private.can_read_matter(matter_id)
             and exists (select 1 from public.matter_type_fields f
                          where f.id = field_id and f.visible_to_client)));
create policy matter_field_values_staff_insert on public.matter_field_values for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_field_values_staff_update on public.matter_field_values for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_field_values_staff_delete on public.matter_field_values for delete to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id));
grant select, insert, update, delete on public.matter_field_values to authenticated;

-- 4. Versions anglaises ---------------------------------------------------------------
alter table public.matter_timeline_steps
  add column title_en text check (title_en is null or length(btrim(title_en)) between 1 and 200),
  add column description_en text check (description_en is null or length(description_en) <= 1000);
alter table public.document_requests
  add column title_en text check (title_en is null or length(btrim(title_en)) between 1 and 200),
  add column description_en text check (description_en is null or length(description_en) <= 1000);

-- 5. Demandes de documents --------------------------------------------------------------
create or replace function private.guard_document_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.matter_access a
                    where a.matter_id = new.matter_id and a.user_id = new.requested_from
                      and a.revoked_at is null) then
      raise exception 'Le destinataire doit avoir un accès actif au dossier' using errcode = '42501';
    end if;
    new.requested_by := auth.uid();
    new.status := 'pending';
    new.fulfilled_at := null;
    return new;
  end if;
  if (new.matter_id, new.requested_from) is distinct from (old.matter_id, old.requested_from) then
    raise exception 'Une demande ne change ni de dossier ni de destinataire' using errcode = '42501';
  end if;
  if new.status = 'fulfilled' and old.status <> 'fulfilled' then
    new.fulfilled_at := now();
  elsif new.status <> 'fulfilled' then
    new.fulfilled_at := null;
  end if;
  return new;
end $$;
create trigger document_requests_guard before insert or update on public.document_requests
  for each row execute function private.guard_document_request();

create or replace function private.audit_document_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('document_request.created', 'document_request', new.id::text, new.matter_id,
      jsonb_build_object('requested_from', new.requested_from));
  elsif new.status is distinct from old.status then
    perform audit.record('document_request.' || new.status::text, 'document_request', new.id::text,
      new.matter_id, '{}');
  end if;
  return null;
end $$;
create trigger document_requests_audit after insert or update on public.document_requests
  for each row execute function private.audit_document_request();

revoke all on function private.guard_matter_field_value(), private.guard_document_request(),
  private.audit_document_request() from public;
