-- Vues enregistrées (ADR 0023) : plafond de 20 vues par personne garanti par la base
-- (le service le vérifie aussi ; ici, ni envois simultanés ni appel direct à l'API ne le dépassent).

create or replace function private.guard_saved_views_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Verrou par propriétaire : deux insertions simultanées ne peuvent pas dépasser le plafond.
  perform pg_advisory_xact_lock(hashtext('matter_saved_views:' || new.owner_id::text));
  if (select count(*) from public.matter_saved_views where owner_id = new.owner_id) >= 20 then
    raise exception 'saved views limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger matter_saved_views_limit before insert on public.matter_saved_views
  for each row execute function private.guard_saved_views_limit();
