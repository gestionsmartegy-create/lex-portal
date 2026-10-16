-- Bureaux (ADR 0024) : durcissement après revue de sécurité.
--  1. public.set_staff_offices : bureaux d'une personne en une seule transaction (plus d'état partiel),
--     sans toucher aux rattachements à un bureau archivé, et sans réécrire les lignes inchangées.
--  2. Garde-fous : personnel ACTIF seulement ; bureau actif aussi à la création d'un dossier.

create or replace function public.set_staff_offices(p_user uuid, p_primary uuid, p_others uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_wanted uuid[] := array(select distinct x from unnest(coalesce(p_others, '{}') || p_primary) as x
                           where x is not null);
begin
  if not private.is_firm_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Retrait : seulement les bureaux actifs absents (un bureau archivé n'est pas proposé à l'écran).
  delete from public.staff_offices so
   where so.user_id = p_user
     and not (so.office_id = any (v_wanted))
     and exists (select 1 from public.offices o where o.id = so.office_id and o.is_active);
  -- L'ancien bureau principal perd ce statut avant qu'un autre le prenne (index unique).
  update public.staff_offices so set is_primary = false
   where so.user_id = p_user and so.is_primary and so.office_id is distinct from p_primary;
  insert into public.staff_offices (user_id, office_id, is_primary)
    select p_user, x, false from unnest(coalesce(p_others, '{}')) as x
     where x is not null and x is distinct from p_primary
  on conflict (user_id, office_id) do nothing;
  if p_primary is not null then
    insert into public.staff_offices (user_id, office_id, is_primary) values (p_user, p_primary, true)
    on conflict (user_id, office_id) do update set is_primary = true where not public.staff_offices.is_primary;
  end if;
end $$;
revoke all on function public.set_staff_offices(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_staff_offices(uuid, uuid, uuid[]) to authenticated;

-- Personnel actif seulement, bureau actif seulement.
create or replace function private.guard_staff_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = new.user_id and p.role in ('staff', 'firm_admin') and p.status = 'active') then
    raise exception 'not an active staff member' using errcode = '23514';
  end if;
  if not exists (select 1 from public.offices o where o.id = new.office_id and o.is_active) then
    raise exception 'office archived' using errcode = '23514';
  end if;
  return new;
end $$;

-- Bureau actif aussi à la création d'un dossier (synchronisation, firm_admin).
create or replace function private.guard_matter_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.office_id is not null
     and (tg_op = 'INSERT' or new.office_id is distinct from old.office_id)
     and not exists (select 1 from public.offices o where o.id = new.office_id and o.is_active) then
    raise exception 'office archived' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger matters_office_guard on public.matters;
create trigger matters_office_guard before insert or update of office_id on public.matters
  for each row execute function private.guard_matter_office();
