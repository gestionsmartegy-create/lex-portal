-- ============================================================================
-- Suivi du dossier par le cabinet (ADR 0018) : étapes visibles par le client.
-- La table public.matter_timeline_steps existe déjà (lecture : dossier lisible ;
-- insertion et modification : équipe du dossier ou firm_admin). Cette migration ajoute :
--  1. la suppression d'une étape (mêmes règles que la modification) ;
--  2. l'avancement du dossier (matters.progress_percent) recalculé à chaque changement ;
--  3. la journalisation de chaque changement d'étape (audit.events, identifiants seulement) ;
--  4. public.move_timeline_step : monter ou descendre une étape (security invoker : RLS).
-- L'équipe du dossier (public.matter_team) a déjà ses règles (firm_admin seul) et son audit.
-- ============================================================================

-- 1. Suppression d'une étape : équipe du dossier ou firm_admin (session du personnel exigée).
create policy timeline_staff_delete on public.matter_timeline_steps for delete to authenticated
  using (private.is_firm_admin() or private.is_on_matter_team(matter_id));
grant delete on public.matter_timeline_steps to authenticated;

-- 2. Avancement : part des étapes terminées, NULL s'il n'y a aucune étape.
--    security definer : la mise à jour de matters.progress_percent n'est pas ouverte à l'API.
create or replace function private.refresh_matter_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_matter uuid := coalesce(new.matter_id, old.matter_id);
begin
  update public.matters m
     set progress_percent = (
       select case when count(*) = 0 then null
                   else round(100.0 * count(*) filter (where s.is_completed) / count(*))::smallint end
         from public.matter_timeline_steps s
        where s.matter_id = v_matter)
   where m.id = v_matter;
  return null;
end $$;

create trigger matter_timeline_progress after insert or update or delete on public.matter_timeline_steps
  for each row execute function private.refresh_matter_progress();

-- 3. Audit : jamais le titre ni la description (texte libre), seulement les identifiants.
create or replace function private.audit_matter_timeline()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('matter_timeline.added', 'matter_timeline_step', new.id::text, new.matter_id, '{}');
  elsif tg_op = 'DELETE' then
    perform audit.record('matter_timeline.removed', 'matter_timeline_step', old.id::text, old.matter_id, '{}');
    return old;
  elsif new.is_completed and not old.is_completed then
    perform audit.record('matter_timeline.completed', 'matter_timeline_step', new.id::text, new.matter_id, '{}');
  elsif old.is_completed and not new.is_completed then
    perform audit.record('matter_timeline.reopened', 'matter_timeline_step', new.id::text, new.matter_id, '{}');
  elsif (new.title, new.description) is distinct from (old.title, old.description) then
    perform audit.record('matter_timeline.updated', 'matter_timeline_step', new.id::text, new.matter_id, '{}');
  end if;
  return new;
end $$;

create trigger matter_timeline_audit after insert or update or delete on public.matter_timeline_steps
  for each row execute function private.audit_matter_timeline();

revoke all on function private.refresh_matter_progress(), private.audit_matter_timeline() from public;

-- 4. Monter (-1) ou descendre (+1) une étape : échange avec sa voisine.
--    security invoker : les règles RLS de lecture et de modification s'appliquent à l'appelant.
--    La contrainte unique (matter_id, position) impose une position temporaire hors plage.
create or replace function public.move_timeline_step(p_step uuid, p_direction integer)
returns boolean
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_matter uuid;
  v_pos smallint;
  v_other uuid;
  v_other_pos smallint;
begin
  if p_direction not in (-1, 1) then
    return false;
  end if;
  select s.matter_id, s.position into v_matter, v_pos
    from public.matter_timeline_steps s where s.id = p_step for update;
  if v_matter is null then
    return false; -- étape introuvable ou invisible : même réponse
  end if;
  select s.id, s.position into v_other, v_other_pos
    from public.matter_timeline_steps s
   where s.matter_id = v_matter
     and (case when p_direction < 0 then s.position < v_pos else s.position > v_pos end)
   order by case when p_direction < 0 then -s.position else s.position end
   limit 1
   for update;
  if v_other is null then
    return false; -- déjà en tête (ou en fin) de liste
  end if;
  update public.matter_timeline_steps set position = -32768 where id = p_step;
  update public.matter_timeline_steps set position = v_pos where id = v_other;
  update public.matter_timeline_steps set position = v_other_pos where id = p_step;
  return found;
end $$;

revoke all on function public.move_timeline_step(uuid, integer) from public, anon;
grant execute on function public.move_timeline_step(uuid, integer) to authenticated;
