-- Lot 4 — Connexion des agendas (ADR 0031, stories E14, E15, E16).
--  1. Agenda Outlook de chaque membre du personnel : connexion (jetons dans Supabase Vault), plages
--     OCCUPÉES seulement (jamais titre, lieu ni participants), rappels de préparation dans un agenda
--     séparé « Lex Portail ». Tables dans `private` (non exposées), fonctions à droits vérifiés.
--  2. Déconnexion par la personne, coupure par le firm_admin, déconnexion automatique d'un compte
--     suspendu ou désactivé. Tout est journalisé.
--  3. Conflits d'horaire : une date de cour dont un avocat présent est occupé dans Outlook.
--  4. Retour depuis Clio : une date modifiée ou introuvable dans Clio est signalée (« À surveiller ») et
--     redevient « à confirmer ». Jamais d'annulation automatique : c'est l'équipe qui annule.

-- ---------------------------------------------------------------------------------------------
-- 1. Tables privées
-- ---------------------------------------------------------------------------------------------
create table private.calendar_connections (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  provider              text not null default 'microsoft_outlook' check (provider = 'microsoft_outlook'),
  -- Connexion au simulateur (données fictives) : jamais présentée comme un vrai agenda.
  is_mock               boolean not null default false,
  status                text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  vault_secret_id       uuid,                    -- référence Vault, jamais le jeton
  scopes                text[] not null default '{}',
  reminders_enabled     boolean not null default false,
  reminders_calendar_id text check (reminders_calendar_id is null or length(reminders_calendar_id) <= 512),
  connected_at          timestamptz not null default now(),
  last_sync_at          timestamptz,
  last_error            text check (last_error is null or length(last_error) <= 64),
  updated_at            timestamptz not null default now()
);
create trigger calendar_connections_updated_at before update on private.calendar_connections
  for each row execute function private.set_updated_at();

-- Plages occupées : début et fin SEULEMENT.
create table private.calendar_busy_blocks (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  check (ends_at > starts_at and ends_at - starts_at <= interval '14 days')
);
create index calendar_busy_blocks_user_idx on private.calendar_busy_blocks (user_id, starts_at);

-- Rappels de préparation écrits dans l'agenda « Lex Portail » (J-7, J-1).
create table private.calendar_reminder_events (
  court_date_id     uuid not null references public.court_dates(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  offset_days       int  not null check (offset_days in (1, 7)),
  external_event_id text not null check (length(external_event_id) <= 512),
  starts_at         timestamptz not null,
  primary key (court_date_id, user_id, offset_days)
);

-- Un profil supprimé (cascade) ne laisse jamais de jeton orphelin dans le coffre.
create or replace function private.on_calendar_connection_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.vault_secret_id is not null then
    delete from vault.secrets s where s.id = old.vault_secret_id;
  end if;
  return old;
end $$;
create trigger calendar_connections_drop_secret after delete on private.calendar_connections
  for each row execute function private.on_calendar_connection_deleted();

alter table private.calendar_connections enable row level security;
alter table private.calendar_busy_blocks enable row level security;
alter table private.calendar_reminder_events enable row level security;
revoke all on private.calendar_connections, private.calendar_busy_blocks, private.calendar_reminder_events
  from public, anon, authenticated;

-- Suppression d'une connexion : secret du coffre, plages occupées et rappels connus, puis audit.
create or replace function private.drop_calendar_connection(p_user uuid, p_reason text, p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_secret uuid;
begin
  delete from private.calendar_connections c where c.user_id = p_user returning c.vault_secret_id into v_secret;
  if not found then
    return false;
  end if;
  if v_secret is not null then
    delete from vault.secrets s where s.id = v_secret;
  end if;
  delete from private.calendar_busy_blocks b where b.user_id = p_user;
  delete from private.calendar_reminder_events r where r.user_id = p_user;
  perform audit.record('calendar.disconnected', 'calendar_connection', p_user::text, null,
                       jsonb_build_object('reason', p_reason), p_actor);
  return true;
end $$;
revoke all on function private.drop_calendar_connection(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Fonctions pour les utilisateurs (droits vérifiés dans la fonction)
-- ---------------------------------------------------------------------------------------------
-- Ma connexion (personnel actif seulement) : état, jamais le jeton.
create or replace function public.my_calendar_connection()
returns table (status text, is_mock boolean, reminders_enabled boolean, connected_at timestamptz,
               last_sync_at timestamptz, last_error text)
language sql stable security definer set search_path = '' as $$
  select c.status, c.is_mock, c.reminders_enabled, c.connected_at, c.last_sync_at, c.last_error
    from private.calendar_connections c
   where private.is_staff() and c.user_id = auth.uid()
$$;

-- Toutes les connexions (firm_admin) : personne, état, dernière synchronisation.
create or replace function public.calendar_connection_list()
returns table (user_id uuid, first_name text, last_name text, title text, status text, is_mock boolean,
               reminders_enabled boolean, connected_at timestamptz, last_sync_at timestamptz, last_error text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_firm_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select c.user_id, p.first_name, p.last_name, p.title, c.status, c.is_mock, c.reminders_enabled,
           c.connected_at, c.last_sync_at, c.last_error
      from private.calendar_connections c
      join public.profiles p on p.id = c.user_id
     order by p.last_name nulls last, p.first_name;
end $$;

-- Déconnecter son agenda (personnel) ou couper celui d'une personne (firm_admin).
create or replace function public.calendar_disconnect(p_user uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_user = auth.uid() and private.is_staff() then
    return private.drop_calendar_connection(p_user, 'self', auth.uid());
  elsif private.is_firm_admin() then
    return private.drop_calendar_connection(p_user, 'admin', auth.uid());
  end if;
  raise exception 'Accès refusé' using errcode = '42501';
end $$;

-- Rappels de préparation dans l'agenda « Lex Portail » : choix de la personne.
create or replace function public.calendar_set_reminders(p_enabled boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update private.calendar_connections c set reminders_enabled = coalesce(p_enabled, false)
   where c.user_id = auth.uid();
  if found then
    perform audit.record('calendar.reminders_set', 'calendar_connection', auth.uid()::text, null,
                         jsonb_build_object('enabled', coalesce(p_enabled, false)));
  end if;
  return found;
end $$;

revoke all on function public.my_calendar_connection() from public, anon;
revoke all on function public.calendar_connection_list() from public, anon;
revoke all on function public.calendar_disconnect(uuid) from public, anon;
revoke all on function public.calendar_set_reminders(boolean) from public, anon;
grant execute on function public.my_calendar_connection() to authenticated;
grant execute on function public.calendar_connection_list() to authenticated;
grant execute on function public.calendar_disconnect(uuid) to authenticated;
grant execute on function public.calendar_set_reminders(boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Fonctions du serveur (service_role seulement : connexions d'intégration, synchronisation)
-- ---------------------------------------------------------------------------------------------
-- Enregistre la connexion d'un membre ACTIF du personnel. p_payload : jetons (null pour le simulateur).
create or replace function public.calendar_save_connection(p_user uuid, p_is_mock boolean, p_payload text, p_scopes text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user and p.role in ('staff', 'firm_admin')
                   and p.status = 'active') then
    raise exception 'not active staff' using errcode = '42501';
  end if;
  select c.vault_secret_id into v_secret from private.calendar_connections c where c.user_id = p_user;
  if p_payload is null then
    if v_secret is not null then
      delete from vault.secrets s where s.id = v_secret;
    end if;
    v_secret := null;
  elsif v_secret is null then
    v_secret := vault.create_secret(p_payload, format('calendar:%s', p_user), 'Jetons d''agenda (ne jamais exporter)');
  else
    perform vault.update_secret(v_secret, p_payload);
  end if;
  insert into private.calendar_connections (user_id, is_mock, status, vault_secret_id, scopes, connected_at, last_error)
  values (p_user, coalesce(p_is_mock, false), 'connected', v_secret, coalesce(p_scopes, '{}'), now(), null)
  on conflict (user_id) do update
    set is_mock = excluded.is_mock, status = 'connected', vault_secret_id = excluded.vault_secret_id,
        scopes = excluded.scopes, connected_at = now(), last_error = null;
  perform audit.record('calendar.connected', 'calendar_connection', p_user::text, null,
                       jsonb_build_object('mock', coalesce(p_is_mock, false)), p_user);
end $$;

create or replace function public.calendar_read_tokens(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret
    from private.calendar_connections c
    join vault.decrypted_secrets ds on ds.id = c.vault_secret_id
   where c.user_id = p_user and c.status = 'connected'
$$;

-- Connexions à synchroniser (planificateur).
create or replace function public.calendar_connections_for_sync()
returns table (user_id uuid, is_mock boolean, reminders_enabled boolean, reminders_calendar_id text)
language sql stable security definer set search_path = '' as $$
  select c.user_id, c.is_mock, c.reminders_enabled, c.reminders_calendar_id
    from private.calendar_connections c
   where c.status = 'connected'
   order by c.last_sync_at nulls first
   limit 200
$$;

-- Remplace les plages occupées d'une personne sur une période ([p_from, p_to[, 62 jours au plus).
-- p_blocks : [{"start": "...", "end": "..."}] ; au plus 1000 plages.
create or replace function public.calendar_store_busy(p_user uuid, p_from timestamptz, p_to timestamptz, p_blocks jsonb)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v_count int;
begin
  if p_to <= p_from or p_to - p_from > interval '62 days' or jsonb_typeof(p_blocks) <> 'array'
     or jsonb_array_length(p_blocks) > 1000 then
    raise exception 'invalid busy window' using errcode = '22023';
  end if;
  if not exists (select 1 from private.calendar_connections c where c.user_id = p_user and c.status = 'connected') then
    return 0;
  end if;
  delete from private.calendar_busy_blocks b
   where b.user_id = p_user and b.ends_at > p_from and b.starts_at < p_to;
  insert into private.calendar_busy_blocks (user_id, starts_at, ends_at)
  select p_user, greatest((e->>'start')::timestamptz, p_from), least((e->>'end')::timestamptz, p_to)
    from jsonb_array_elements(p_blocks) e
   where (e->>'end')::timestamptz > (e->>'start')::timestamptz
     and (e->>'end')::timestamptz > p_from and (e->>'start')::timestamptz < p_to
     and (e->>'end')::timestamptz - (e->>'start')::timestamptz <= interval '14 days';
  get diagnostics v_count = row_count;
  update private.calendar_connections c set last_sync_at = now(), last_error = null where c.user_id = p_user;
  return v_count;
end $$;

-- Échec d'une synchronisation (code interne seulement). TOKEN_REVOKED : « à reconnecter ».
create or replace function public.calendar_report_error(p_user uuid, p_error text)
returns void language sql volatile security definer set search_path = '' as $$
  update private.calendar_connections c
     set last_error = left(p_error, 64),
         status = case when p_error in ('TOKEN_REVOKED', 'MODE_CHANGED') then 'needs_reconnect' else c.status end
   where c.user_id = p_user
$$;

create or replace function public.calendar_set_reminder_calendar(p_user uuid, p_calendar_id text)
returns void language sql volatile security definer set search_path = '' as $$
  update private.calendar_connections c set reminders_calendar_id = left(p_calendar_id, 512) where c.user_id = p_user
$$;

-- Plan des rappels d'une personne : ce qui doit exister (dates de cour à venir où elle est présente,
-- 30 jours, J-7 et J-1 encore dans le futur) et ce qui existe déjà. desired_start null : à retirer.
create or replace function public.calendar_reminder_plan(p_user uuid)
returns table (court_date_id uuid, offset_days int, desired_start timestamptz, timezone text,
               external_event_id text, current_start timestamptz, kind text, display_number text)
language sql stable security definer set search_path = '' as $$
  with conn as (
    select c.reminders_enabled from private.calendar_connections c where c.user_id = p_user and c.status = 'connected'
  ), wanted as (
    select cd.id as court_date_id, o.d as offset_days, cd.starts_at - make_interval(days => o.d) as desired_start,
           cd.timezone, cd.kind, m.display_number
      from public.court_dates cd
      join public.court_date_attendees a on a.court_date_id = cd.id and a.user_id = p_user
      join public.matters m on m.id = cd.matter_id
      cross join (values (1), (7)) o(d)
     where (select reminders_enabled from conn)
       and cd.status in ('scheduled', 'confirmed')
       and cd.starts_at > now() and cd.starts_at < now() + interval '30 days'
       and cd.starts_at - make_interval(days => o.d) > now()
  )
  select coalesce(w.court_date_id, r.court_date_id), coalesce(w.offset_days, r.offset_days), w.desired_start,
         w.timezone, r.external_event_id, r.starts_at, w.kind, w.display_number
    from wanted w
    full join (select * from private.calendar_reminder_events e where e.user_id = p_user) r
      on r.court_date_id = w.court_date_id and r.offset_days = w.offset_days
   limit 400
$$;

-- Enregistre (ou retire, p_event_id null) un rappel écrit dans l'agenda.
create or replace function public.calendar_reminder_record(p_user uuid, p_court_date uuid, p_offset int,
                                                           p_event_id text, p_starts timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_event_id is null then
    delete from private.calendar_reminder_events e
     where e.user_id = p_user and e.court_date_id = p_court_date and e.offset_days = p_offset;
  else
    insert into private.calendar_reminder_events (court_date_id, user_id, offset_days, external_event_id, starts_at)
    values (p_court_date, p_user, p_offset, p_event_id, p_starts)
    on conflict (court_date_id, user_id, offset_days) do update
      set external_event_id = excluded.external_event_id, starts_at = excluded.starts_at;
  end if;
end $$;

-- Rappels connus d'une personne (avant une déconnexion : on tente de les retirer de l'agenda).
create or replace function public.calendar_reminder_events_of(p_user uuid)
returns table (court_date_id uuid, offset_days int, external_event_id text)
language sql stable security definer set search_path = '' as $$
  select e.court_date_id, e.offset_days, e.external_event_id
    from private.calendar_reminder_events e where e.user_id = p_user
$$;

revoke all on function public.calendar_save_connection(uuid, boolean, text, text[]) from public, anon, authenticated;
revoke all on function public.calendar_read_tokens(uuid) from public, anon, authenticated;
revoke all on function public.calendar_connections_for_sync() from public, anon, authenticated;
revoke all on function public.calendar_store_busy(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.calendar_report_error(uuid, text) from public, anon, authenticated;
revoke all on function public.calendar_set_reminder_calendar(uuid, text) from public, anon, authenticated;
revoke all on function public.calendar_reminder_plan(uuid) from public, anon, authenticated;
revoke all on function public.calendar_reminder_record(uuid, uuid, int, text, timestamptz) from public, anon, authenticated;
revoke all on function public.calendar_reminder_events_of(uuid) from public, anon, authenticated;
grant execute on function public.calendar_save_connection(uuid, boolean, text, text[]) to service_role;
grant execute on function public.calendar_read_tokens(uuid) to service_role;
grant execute on function public.calendar_connections_for_sync() to service_role;
grant execute on function public.calendar_store_busy(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.calendar_report_error(uuid, text) to service_role;
grant execute on function public.calendar_set_reminder_calendar(uuid, text) to service_role;
grant execute on function public.calendar_reminder_plan(uuid) to service_role;
grant execute on function public.calendar_reminder_record(uuid, uuid, int, text, timestamptz) to service_role;
grant execute on function public.calendar_reminder_events_of(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Compte suspendu, désactivé ou devenu client : déconnexion automatique (E15)
-- ---------------------------------------------------------------------------------------------
create or replace function private.on_profile_calendar_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.status <> 'active' or new.role not in ('staff', 'firm_admin'))
     and exists (select 1 from private.calendar_connections c where c.user_id = new.id) then
    perform private.drop_calendar_connection(new.id, 'deactivated', auth.uid());
  end if;
  return null;
end $$;
create trigger profiles_calendar_guard after update of status, role on public.profiles
  for each row execute function private.on_profile_calendar_guard();

-- ---------------------------------------------------------------------------------------------
-- 5. Conflits avec l'agenda Outlook (E11, E14)
-- ---------------------------------------------------------------------------------------------
-- Dates de cour visibles (mêmes règles que court_calendar_feed) dont un avocat présent est occupé.
-- Une plage qui coïncide avec la date elle-même (à 2 minutes près) est ignorée : c'est la même
-- audience, recopiée dans Outlook par Clio. Seuls l'identifiant de la date et la personne sortent.
create or replace function public.court_date_busy_conflicts(p_from timestamptz, p_to timestamptz)
returns table (court_date_id uuid, user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct c.id, a.user_id
    from public.court_dates c
    join public.court_date_attendees a on a.court_date_id = c.id
    join private.calendar_busy_blocks b on b.user_id = a.user_id
   where private.is_staff()
     and p_to > p_from and p_to - p_from <= interval '62 days'
     and c.starts_at >= p_from and c.starts_at < p_to
     and c.status in ('scheduled', 'confirmed') and not c.all_day
     and (private.sees_all_court_dates() or private.is_on_matter_team(c.matter_id))
     and b.starts_at < coalesce(c.ends_at, c.starts_at + interval '1 hour')
     and b.ends_at > c.starts_at
     and not (abs(extract(epoch from b.starts_at - c.starts_at)) < 120
              and abs(extract(epoch from b.ends_at - coalesce(c.ends_at, c.starts_at + interval '1 hour'))) < 120)
   limit 500
$$;
revoke all on function public.court_date_busy_conflicts(timestamptz, timestamptz) from public, anon;
grant execute on function public.court_date_busy_conflicts(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Retour depuis Clio (E16) : date modifiée ou supprimée dans Clio
-- ---------------------------------------------------------------------------------------------
alter table public.court_dates
  add column clio_change text check (clio_change in ('moved', 'deleted')),
  add column clio_changed_at timestamptz;
-- Pas de droit d'écriture pour les utilisateurs (droits par colonne inchangés) : seule la base l'écrit.

-- L'équipe reprend la main (confirmation, nouvelle heure, clôture) : le signalement disparaît.
create or replace function private.clear_court_date_clio_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and old.clio_change is not null
     and (new.status is distinct from old.status
          or (new.starts_at, new.ends_at, new.all_day) is distinct from (old.starts_at, old.ends_at, old.all_day)) then
    new.clio_change := null;
    new.clio_changed_at := null;
  end if;
  return new;
end $$;
create trigger court_dates_clear_clio_change before update on public.court_dates
  for each row execute function private.clear_court_date_clio_change();

-- Applique un changement constaté dans Clio. moved : nouvelle heure, et une date confirmée redevient
-- « à confirmer ». deleted (entrée introuvable) : la date redevient « à confirmer » et est signalée ;
-- elle n'est JAMAIS annulée automatiquement (un 404 peut venir d'un droit ou d'un calendrier changé,
-- et une date annulée ne se rouvre pas). L'équipe confirme (une nouvelle entrée Clio est écrite) ou annule.
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
  perform audit.record('court_date.clio_changed', 'court_date', p_id::text, v_matter,
                       jsonb_build_object('change', p_change));
  return true;
end $$;
revoke all on function public.court_date_apply_clio_change(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.court_date_apply_clio_change(uuid, text, timestamptz, timestamptz) to service_role;

-- Calendrier de cour : le signalement Clio en plus (type de retour modifié : fonction recréée, mêmes droits).
drop function public.court_calendar_feed(timestamptz, timestamptz);
create function public.court_calendar_feed(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, matter_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz,
  all_day boolean, timezone text, court_id uuid, room text,
  display_number text, title text, office_id uuid, attendee_ids uuid[], on_team boolean,
  type_code text, practice_group text, clio_change text, clio_changed_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.matter_id, c.kind, c.status, c.starts_at, c.ends_at, c.all_day, c.timezone, c.court_id, c.room,
         m.display_number,
         -- Titre (souvent le nom du client) : équipe du dossier et firm_admin seulement (minimisation).
         case when private.is_firm_admin() or private.is_on_matter_team(c.matter_id) then m.title end,
         m.office_id,
         coalesce((select array_agg(a.user_id) from public.court_date_attendees a where a.court_date_id = c.id), '{}'),
         (private.is_firm_admin() or private.is_on_matter_team(c.matter_id)),
         t.code,
         t.practice_group,
         c.clio_change,
         c.clio_changed_at
    from public.court_dates c
    join public.matters m on m.id = c.matter_id
    left join public.matter_types t on t.id = m.matter_type_id
   where private.is_staff()
     and p_to > p_from and p_to - p_from <= interval '62 days'
     and c.starts_at >= p_from and c.starts_at < p_to
     and (private.sees_all_court_dates() or private.is_on_matter_team(c.matter_id))
   order by c.starts_at
   limit 500
$$;
revoke all on function public.court_calendar_feed(timestamptz, timestamptz) from public, anon;
grant execute on function public.court_calendar_feed(timestamptz, timestamptz) to authenticated;
