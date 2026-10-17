-- ============================================================================
-- Calendrier de cour : accès des adjoint(e)s à tout le cabinet (ADR 0027).
-- Décision du cabinet (courriel de la direction, 2026-10-16, sur demande de Me Saintelmy) :
-- « tous les adjoints devront avoir accès au calendrier » ; précisé le même jour par le responsable : tout le cabinet.
--  1. public.court_calendar_viewers : membres du personnel désignés par le firm_admin (adjoint·e·s).
--  2. public.court_calendar_feed() : lecture du calendrier en colonnes LIMITÉES (sans notes internes,
--     lien virtuel, consignes, juge ni greffe ; titre du dossier réservé à l'équipe) : équipe du
--     dossier, firm_admin, ou personne désignée.
-- La RLS de public.court_dates est inchangée : une personne désignée ne lit pas les notes d'un
-- dossier hors de ses équipes, ne modifie rien et n'ouvre pas le dossier.
-- ============================================================================

create table public.court_calendar_viewers (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.court_calendar_viewers enable row level security;

create policy court_calendar_viewers_select on public.court_calendar_viewers for select to authenticated
  using (private.is_staff());
create policy court_calendar_viewers_insert on public.court_calendar_viewers for insert to authenticated
  with check (private.is_firm_admin());
create policy court_calendar_viewers_delete on public.court_calendar_viewers for delete to authenticated
  using (private.is_firm_admin());
grant select, insert, delete on public.court_calendar_viewers to authenticated;

-- Personnel actif seulement ; auteur imposé.
create or replace function private.guard_court_calendar_viewer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.granted_by := auth.uid();
  if not exists (select 1 from public.profiles p
                  where p.id = new.user_id and p.role in ('staff', 'firm_admin') and p.status = 'active') then
    raise exception 'not an active staff member' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger court_calendar_viewers_guard before insert on public.court_calendar_viewers
  for each row execute function private.guard_court_calendar_viewer();

create or replace function private.audit_court_calendar_viewer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.court_calendar_viewers := coalesce(new, old);
begin
  perform audit.record(case tg_op when 'INSERT' then 'court_calendar.viewer_added' else 'court_calendar.viewer_removed' end,
    'profile', v_row.user_id::text, null, '{}');
  return null;
end $$;
create trigger court_calendar_viewers_audit after insert or delete on public.court_calendar_viewers
  for each row execute function private.audit_court_calendar_viewer();

-- Vue de tout le cabinet : firm_admin, ou membre du personnel désigné.
create or replace function private.sees_all_court_dates()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_firm_admin()
      or (private.is_staff() and exists (select 1 from public.court_calendar_viewers v where v.user_id = auth.uid()))
$$;

-- Calendrier : colonnes limitées, période bornée (62 jours au plus), 500 lignes au plus.
create or replace function public.court_calendar_feed(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, matter_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz,
  all_day boolean, timezone text, court_id uuid, room text,
  display_number text, title text, office_id uuid, attendee_ids uuid[], on_team boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.matter_id, c.kind, c.status, c.starts_at, c.ends_at, c.all_day, c.timezone, c.court_id, c.room,
         m.display_number,
         -- Titre (souvent le nom du client) : équipe du dossier et firm_admin seulement (minimisation).
         case when private.is_firm_admin() or private.is_on_matter_team(c.matter_id) then m.title end,
         m.office_id,
         coalesce((select array_agg(a.user_id) from public.court_date_attendees a where a.court_date_id = c.id), '{}'),
         (private.is_firm_admin() or private.is_on_matter_team(c.matter_id))
    from public.court_dates c
    join public.matters m on m.id = c.matter_id
   where private.is_staff()
     and p_to > p_from and p_to - p_from <= interval '62 days'
     and c.starts_at >= p_from and c.starts_at < p_to
     and (private.sees_all_court_dates() or private.is_on_matter_team(c.matter_id))
   order by c.starts_at
   limit 500
$$;

revoke all on function private.guard_court_calendar_viewer(), private.audit_court_calendar_viewer(),
  private.sees_all_court_dates() from public;
revoke all on function public.court_calendar_feed(timestamptz, timestamptz) from public, anon;
grant execute on function public.court_calendar_feed(timestamptz, timestamptz) to authenticated;
