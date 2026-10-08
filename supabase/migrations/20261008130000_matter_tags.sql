-- ============================================================================
-- Étiquettes de dossiers (ADR 0021) : suivi de portefeuille, mieux que Clio.
--  1. public.matter_tags : étiquettes définies par le firm_admin (nom bilingue, couleur parmi une
--     palette fermée, interne ou visible par le client, ordre, active).
--  2. public.matter_tag_links : étiquettes posées sur un dossier par l'équipe ou le firm_admin.
--     Lecture : personnel (étiquettes) / équipe et firm_admin (liens) ; client : seulement les
--     étiquettes visibles posées sur un dossier qu'il peut lire.
--  3. Journal : pose et retrait d'une étiquette (identifiants seulement).
-- ============================================================================

create table public.matter_tags (
  id                uuid primary key default gen_random_uuid(),
  name_fr           text not null check (length(btrim(name_fr)) between 1 and 60),
  name_en           text not null check (length(btrim(name_en)) between 1 and 60),
  color             text not null default 'gold'
                      check (color in ('marine', 'gold', 'red', 'orange', 'green', 'blue', 'purple', 'gray')),
  visible_to_client boolean not null default false,
  position          smallint not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger matter_tags_updated_at before update on public.matter_tags
  for each row execute function private.set_updated_at();

create table public.matter_tag_links (
  matter_id  uuid not null references public.matters(id) on delete cascade,
  tag_id     uuid not null references public.matter_tags(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (matter_id, tag_id)
);
create index matter_tag_links_tag_idx on public.matter_tag_links (tag_id);

alter table public.matter_tags enable row level security;
alter table public.matter_tag_links enable row level security;

-- Étiquettes : personnel ; client : étiquettes visibles posées sur un de ses dossiers.
-- Fonctions de contrôle (security definer) : évitent que les règles des deux tables
-- se consultent mutuellement (récursion RLS). Elles ne renvoient qu'un booléen.
create or replace function private.tag_is_visible(p_tag uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select t.visible_to_client from public.matter_tags t where t.id = p_tag), false)
$$;
create or replace function private.client_sees_tag(p_tag uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matter_tag_links l
                  where l.tag_id = p_tag and private.can_read_matter(l.matter_id))
$$;
revoke all on function private.tag_is_visible(uuid), private.client_sees_tag(uuid) from public;
grant execute on function private.tag_is_visible(uuid), private.client_sees_tag(uuid) to authenticated;

create policy matter_tags_select on public.matter_tags for select to authenticated
  using (private.is_staff() or (visible_to_client and private.client_sees_tag(id)));
create policy matter_tags_admin_insert on public.matter_tags for insert to authenticated
  with check (private.is_firm_admin());
create policy matter_tags_admin_update on public.matter_tags for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
create policy matter_tags_admin_delete on public.matter_tags for delete to authenticated
  using (private.is_firm_admin());

-- Liens : équipe ou firm_admin ; client : liens d'étiquettes visibles sur ses dossiers.
create policy matter_tag_links_select on public.matter_tag_links for select to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id)
         or (not private.is_staff() and private.can_read_matter(matter_id) and private.tag_is_visible(tag_id)));
create policy matter_tag_links_staff_insert on public.matter_tag_links for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_tag_links_staff_delete on public.matter_tag_links for delete to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id));

grant select, insert, update, delete on public.matter_tags to authenticated;
grant select, insert, delete on public.matter_tag_links to authenticated;

-- Auteur imposé par la base ; journal sans texte libre.
create or replace function private.guard_matter_tag_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;
create trigger matter_tag_links_guard before insert on public.matter_tag_links
  for each row execute function private.guard_matter_tag_link();

create or replace function private.audit_matter_tag_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('matter_tag.added', 'matter_tag', new.tag_id::text, new.matter_id, '{}');
  else
    perform audit.record('matter_tag.removed', 'matter_tag', old.tag_id::text, old.matter_id, '{}');
  end if;
  return null;
end $$;
create trigger matter_tag_links_audit after insert or delete on public.matter_tag_links
  for each row execute function private.audit_matter_tag_link();

-- Les modifications des étiquettes elles-mêmes passent par le journal des modèles ; un changement de
-- visibilité pour le client y est signalé (comme pour les champs du dossier).
create or replace function private.audit_matter_template()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_action text := 'matter_template.' || lower(tg_op);
  v_meta jsonb := jsonb_build_object('table', tg_table_name);
begin
  if tg_table_name in ('matter_type_fields', 'matter_tags') then
    v_meta := v_meta || jsonb_build_object('visible_to_client', (v_row ->> 'visible_to_client')::boolean);
    if tg_op = 'UPDATE' and (to_jsonb(new) ->> 'visible_to_client') is distinct from (to_jsonb(old) ->> 'visible_to_client') then
      v_action := 'matter_template.field_visibility';
    end if;
  end if;
  perform audit.record(v_action, tg_table_name, v_row ->> 'id', null, v_meta);
  return null;
end $$;

create trigger matter_tags_audit after insert or update or delete on public.matter_tags
  for each row execute function private.audit_matter_template();

revoke all on function private.guard_matter_tag_link(), private.audit_matter_tag_link() from public;

-- Étiquettes de départ (le cabinet les ajuste) : internes, sauf « Dossier complet ».
insert into public.matter_tags (name_fr, name_en, color, visible_to_client, position) values
  ('Urgent', 'Urgent', 'red', false, 1),
  ('En attente d''IRCC', 'Awaiting IRCC', 'orange', false, 2),
  ('Audience à venir', 'Upcoming hearing', 'purple', false, 3),
  ('Relance client', 'Client follow-up', 'blue', false, 4),
  ('Dossier complet', 'File complete', 'green', true, 5),
  ('En pause', 'On hold', 'gray', false, 6);
