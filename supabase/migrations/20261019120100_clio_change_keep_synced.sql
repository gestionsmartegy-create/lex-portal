-- Retour depuis Clio (ADR 0031), correction après QA : un changement constaté dans Clio ne doit pas
-- relancer une écriture vers Clio. Le garde-fou `guard_court_date` repasse `clio_sync_status` à
-- « pending » dès qu'une colonne métier change : sans cette correction, une date introuvable dans Clio
-- y était recréée au passage suivant du planificateur, avant toute décision de l'équipe (et une date
-- déplacée y était réécrite, écrasant la description modifiée dans Clio).
-- Correction : après le signalement, la date reste « synced ». Seules les colonnes Clio changent dans la
-- seconde mise à jour : le garde-fou ne la remet pas en attente et le journal n'ajoute aucune ligne.
-- C'est l'équipe qui relance l'écriture, en confirmant (nouvelle entrée Clio) ou en annulant la date.

create or replace function public.court_date_apply_clio_change(p_id uuid, p_change text, p_starts timestamptz,
                                                               p_ends timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_matter uuid;
begin
  if p_change = 'moved' then
    if p_starts is null or (p_ends is not null and p_ends <= p_starts) then
      raise exception 'invalid times' using errcode = '22023';
    end if;
    update public.court_dates c
       set starts_at = p_starts, ends_at = p_ends,
           status = case when c.status = 'confirmed' then 'scheduled' else c.status end,
           clio_change = 'moved', clio_changed_at = now()
     where c.id = p_id and c.status in ('scheduled', 'confirmed') and c.clio_sync_status = 'synced'
    returning c.matter_id into v_matter;
  elsif p_change = 'deleted' then
    update public.court_dates c
       set status = 'scheduled', clio_change = 'deleted', clio_changed_at = now()
     where c.id = p_id and c.status in ('scheduled', 'confirmed') and c.clio_sync_status = 'synced'
       and c.clio_change is distinct from 'deleted'
    returning c.matter_id into v_matter;
  else
    raise exception 'invalid change' using errcode = '22023';
  end if;
  if v_matter is null then
    return false;
  end if;
  -- La date vient de Clio : rien à y réécrire tant que l'équipe n'a pas agi.
  update public.court_dates c set clio_sync_status = 'synced' where c.id = p_id;
  perform audit.record('court_date.clio_changed', 'court_date', p_id::text, v_matter,
                       jsonb_build_object('change', p_change));
  return true;
end $$;
revoke all on function public.court_date_apply_clio_change(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.court_date_apply_clio_change(uuid, text, timestamptz, timestamptz) to service_role;
