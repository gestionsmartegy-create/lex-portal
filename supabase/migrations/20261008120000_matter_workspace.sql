-- ============================================================================
-- Espace « Dossier » unifié (ADR 0020).
--  1. public.matter_deliverables : ce que le cabinet remet au client (avis, demande déposée,
--     contrat…), avec date prévue, responsable, état, visibilité par le client.
--     Lecture : équipe du dossier, firm_admin ; client : livrables visibles d'un dossier lisible.
--     Écriture : équipe du dossier ou firm_admin.
--  2. Demandes de documents : le document lié à une demande (fulfilled_document_id) doit
--     appartenir au même dossier ; le lier marque la demande « reçue ».
-- ============================================================================

-- 1. Livrables ---------------------------------------------------------------------
create table public.matter_deliverables (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references public.matters(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 1 and 200),
  description       text check (description is null or length(description) <= 1000),
  due_date          date,
  status            text not null default 'planned'
                      check (status in ('planned', 'in_progress', 'delivered', 'cancelled')),
  owner_id          uuid references public.profiles(id) on delete set null,
  visible_to_client boolean not null default true,
  delivered_at      timestamptz,
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index matter_deliverables_matter_idx on public.matter_deliverables (matter_id, due_date);

create trigger matter_deliverables_updated_at before update on public.matter_deliverables
  for each row execute function private.set_updated_at();

-- Le responsable est un membre du personnel ; dossier, auteur et date de remise tenus par la base.
create or replace function private.guard_matter_deliverable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.owner_id and p.role in ('staff', 'firm_admin')) then
    raise exception 'Le responsable d''un livrable doit être un membre du personnel' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.matter_id is distinct from old.matter_id then
      raise exception 'Un livrable ne change pas de dossier' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
  end if;
  if new.status = 'delivered' and (tg_op = 'INSERT' or old.status <> 'delivered') then
    new.delivered_at := now();
  elsif new.status <> 'delivered' then
    new.delivered_at := null;
  end if;
  return new;
end $$;
create trigger matter_deliverables_guard before insert or update on public.matter_deliverables
  for each row execute function private.guard_matter_deliverable();

create or replace function private.audit_matter_deliverable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('matter_deliverable.added', 'matter_deliverable', new.id::text, new.matter_id, '{}');
  elsif tg_op = 'DELETE' then
    perform audit.record('matter_deliverable.removed', 'matter_deliverable', old.id::text, old.matter_id, '{}');
    return old;
  elsif new.status is distinct from old.status then
    perform audit.record('matter_deliverable.' || new.status, 'matter_deliverable', new.id::text, new.matter_id, '{}');
  elsif new.visible_to_client is distinct from old.visible_to_client then
    perform audit.record('matter_deliverable.visibility', 'matter_deliverable', new.id::text, new.matter_id,
      jsonb_build_object('visible_to_client', new.visible_to_client));
  end if;
  return new;
end $$;
create trigger matter_deliverables_audit after insert or update or delete on public.matter_deliverables
  for each row execute function private.audit_matter_deliverable();

alter table public.matter_deliverables enable row level security;
create policy matter_deliverables_select on public.matter_deliverables for select to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id)
         or (not private.is_staff() and visible_to_client and private.can_read_matter(matter_id)));
create policy matter_deliverables_staff_insert on public.matter_deliverables for insert to authenticated
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_deliverables_staff_update on public.matter_deliverables for update to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id))
  with check (private.is_firm_admin() or private.is_on_matter_team(matter_id));
create policy matter_deliverables_staff_delete on public.matter_deliverables for delete to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id));
grant select, insert, update, delete on public.matter_deliverables to authenticated;

-- 2. Document lié à une demande ------------------------------------------------------
create or replace function private.guard_document_request_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fulfilled_document_id is not null
     and new.fulfilled_document_id is distinct from old.fulfilled_document_id then
    if not exists (select 1 from public.documents d
                    where d.id = new.fulfilled_document_id and d.matter_id = new.matter_id) then
      raise exception 'Le document doit appartenir au même dossier' using errcode = '42501';
    end if;
    new.status := 'fulfilled';
  end if;
  return new;
end $$;
-- Nom choisi pour s'exécuter AVANT document_requests_guard (ordre alphabétique des triggers) :
-- la demande devient « reçue », puis le garde pose la date de réception.
create trigger document_requests_document before update on public.document_requests
  for each row execute function private.guard_document_request_document();

revoke all on function private.guard_matter_deliverable(), private.audit_matter_deliverable(),
  private.guard_document_request_document() from public;
