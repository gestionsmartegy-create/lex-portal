-- Dates de cour (ADR 0025) : durcissement après revue de sécurité (avant tout déploiement).
--  1. Droits par colonne : l'équipe ne peut plus écrire la confirmation ni les colonnes de
--     synchronisation Clio (identifiant d'entrée, état), réservées à la base et au serveur.
--  2. Confirmation : auteur et date conservés tant que la date n'est pas confirmée à nouveau.
--  3. Date remplacée : du même dossier. Champs d'une ligne : sans caractère de contrôle.
--  4. Synchronisation : état « syncing » pour réserver une date (pas d'écriture Clio en double).

revoke insert, update on public.court_dates from authenticated;
grant insert (id, matter_id, kind, starts_at, ends_at, all_day, timezone, court_id, room, judge, docket_number, mode,
              virtual_link, notes, client_instructions, visible_to_client, status, replaces_id)
  on public.court_dates to authenticated;
grant update (kind, starts_at, ends_at, all_day, timezone, court_id, room, judge, docket_number, mode,
              virtual_link, notes, client_instructions, visible_to_client, status, cancel_reason)
  on public.court_dates to authenticated;

alter table public.court_dates drop constraint court_dates_clio_sync_status_check;
alter table public.court_dates add constraint court_dates_clio_sync_status_check
  check (clio_sync_status in ('pending', 'syncing', 'synced', 'failed', 'not_applicable'));
alter table public.court_dates add constraint court_dates_single_line_check
  check (coalesce(room, '') !~ '[[:cntrl:]]' and coalesce(judge, '') !~ '[[:cntrl:]]'
         and coalesce(docket_number, '') !~ '[[:cntrl:]]');
alter table public.court_dates drop constraint court_dates_virtual_link_check;
alter table public.court_dates add constraint court_dates_virtual_link_check
  check (virtual_link is null or virtual_link ~ '^https://[^[:space:][:cntrl:]]+$');

create or replace function private.guard_court_date()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.confirmed_by := null;
    new.confirmed_at := null;
    new.clio_calendar_entry_id := null;
    new.clio_sync_status := 'pending';
    new.clio_synced_at := null;
    if new.status not in ('scheduled', 'confirmed') then
      raise exception 'invalid initial status' using errcode = '23514';
    end if;
    if new.replaces_id is not null and not exists (
         select 1 from public.court_dates r where r.id = new.replaces_id and r.matter_id = new.matter_id) then
      raise exception 'replaced date from another matter' using errcode = '23514';
    end if;
  else
    if new.matter_id <> old.matter_id or new.created_by is distinct from old.created_by
       or new.replaces_id is distinct from old.replaces_id then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    if old.status in ('cancelled', 'adjourned', 'held')
       and (to_jsonb(new) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at'])
           is distinct from (to_jsonb(old) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at']) then
      raise exception 'court date closed' using errcode = '23514';
    end if;
    if old.status = 'confirmed' and new.status = 'confirmed'
       and (new.starts_at, new.ends_at, new.all_day, new.timezone, new.court_id)
           is distinct from (old.starts_at, old.ends_at, old.all_day, old.timezone, old.court_id) then
      new.status := 'scheduled';
    end if;
    -- La confirmation n'est jamais écrite par l'utilisateur : on garde les anciennes valeurs.
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
  end if;
  -- Confirmation : auteur et date imposés au passage à « confirmée » ; retirés si la date ne l'est plus
  -- (une date « tenue » garde la confirmation qu'elle avait).
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  elsif new.status not in ('confirmed', 'held') then
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  if new.status <> 'cancelled' then
    new.cancel_reason := null;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at',
                                'confirmed_by', 'confirmed_at', 'visible_to_client', 'client_instructions'])
         is distinct from (to_jsonb(old) - array['clio_calendar_entry_id', 'clio_sync_status', 'clio_synced_at', 'updated_at',
                                'confirmed_by', 'confirmed_at', 'visible_to_client', 'client_instructions'])
     and new.clio_sync_status is not distinct from old.clio_sync_status
     and new.clio_sync_status <> 'not_applicable' then
    new.clio_sync_status := 'pending';
  end if;
  if new.court_id is not null and (tg_op = 'INSERT' or new.court_id is distinct from old.court_id)
     and not exists (select 1 from public.courts c where c.id = new.court_id and c.is_active) then
    raise exception 'court archived' using errcode = '23514';
  end if;
  return new;
end $$;
