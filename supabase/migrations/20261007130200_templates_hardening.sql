-- ============================================================================
-- Modèles de dossiers (ADR 0019) : renforcements demandés par la revue de sécurité.
--  1. Demandes de documents : l'auteur (requested_by) ne change jamais après la création.
--  2. Un champ déjà rempli sur un dossier ne change pas de genre (texte, date, nombre) :
--     sinon des valeurs deviendraient invalides (ex. un texte affiché comme une date).
--  3. Journal des modèles : toute modification des tables de modèles est tracée (identifiants,
--     et la visibilité d'un champ pour le client) ; jamais les libellés.
-- ============================================================================

-- 1. Auteur figé (la base pose aussi le statut initial et la date de réception).
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
  new.requested_by := old.requested_by;
  if new.status = 'fulfilled' and old.status <> 'fulfilled' then
    new.fulfilled_at := now();
  elsif new.status <> 'fulfilled' then
    new.fulfilled_at := null;
  end if;
  return new;
end $$;

-- 2. Genre d'un champ figé dès qu'il a des valeurs.
create or replace function private.guard_matter_type_field()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind is distinct from old.kind
     and exists (select 1 from public.matter_field_values v where v.field_id = old.id) then
    raise exception 'Ce champ est déjà rempli sur des dossiers : son genre ne peut plus changer'
      using errcode = '42501';
  end if;
  if new.matter_type_id is distinct from old.matter_type_id then
    raise exception 'Un champ ne change pas de type de dossier' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger matter_type_fields_guard before update on public.matter_type_fields
  for each row execute function private.guard_matter_type_field();

-- 3. Journal des modèles.
create or replace function private.audit_matter_template()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_action text := 'matter_template.' || lower(tg_op);
  v_meta jsonb := jsonb_build_object('table', tg_table_name);
begin
  if tg_table_name = 'matter_type_fields' then
    v_meta := v_meta || jsonb_build_object('visible_to_client', (v_row ->> 'visible_to_client')::boolean);
    if tg_op = 'UPDATE' and new.visible_to_client is distinct from old.visible_to_client then
      v_action := 'matter_template.field_visibility';
    end if;
  end if;
  perform audit.record(v_action, tg_table_name, v_row ->> 'id', null, v_meta);
  return null;
end $$;

create trigger matter_types_audit after insert or update or delete on public.matter_types
  for each row execute function private.audit_matter_template();
create trigger matter_type_steps_audit after insert or update or delete on public.matter_type_steps
  for each row execute function private.audit_matter_template();
create trigger matter_type_documents_audit after insert or update or delete on public.matter_type_documents
  for each row execute function private.audit_matter_template();
create trigger matter_type_fields_audit after insert or update or delete on public.matter_type_fields
  for each row execute function private.audit_matter_template();

revoke all on function private.guard_matter_type_field(), private.audit_matter_template() from public;
