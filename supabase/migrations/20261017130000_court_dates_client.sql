-- ============================================================================
-- Dates de cour, côté client (ADR 0028, lot 5 du plan « bureaux et calendrier de cour »).
--  1. public.client_court_dates() : le client lit SEULEMENT les dates que l'avocat a rendues
--     visibles, en colonnes limitées (jamais les notes internes, le juge, le n° de greffe,
--     les avocats présents ni l'état Clio). Session client valide (aal2) exigée par can_read_matter.
--  2. private.court_date_reminders : rappels J-7 et J-1 déjà envoyés (une fois par date,
--     par client et par sorte), écrits par le serveur (service_role, usage permis : notifications).
--  3. Type de notification « court_date_reminder ».
-- La RLS de public.court_dates est inchangée : le client n'y a toujours aucun accès direct.
-- ============================================================================

alter type public.notification_type add value if not exists 'court_date_reminder';

create table private.court_date_reminders (
  court_date_id uuid not null references public.court_dates(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('7d', '1d')),
  sent_at       timestamptz not null default now(),
  primary key (court_date_id, user_id, kind)
);
alter table private.court_date_reminders enable row level security;

create or replace function public.client_court_dates(p_matter uuid default null)
returns table (
  id uuid, matter_id uuid, display_number text, kind text, status text,
  starts_at timestamptz, ends_at timestamptz, all_day boolean, timezone text,
  court_name_fr text, court_name_en text, court_address text, room text,
  mode text, virtual_link text, client_instructions text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.matter_id, m.display_number, c.kind, c.status,
         c.starts_at, c.ends_at, c.all_day, c.timezone,
         ct.name_fr, ct.name_en, ct.address, c.room,
         c.mode, case when c.mode <> 'in_person' then c.virtual_link end, c.client_instructions
    from public.court_dates c
    join public.matters m on m.id = c.matter_id
    left join public.courts ct on ct.id = c.court_id
   where c.visible_to_client
     and c.status in ('scheduled', 'confirmed')
     and coalesce(c.ends_at, c.starts_at) >= now() - interval '1 day'
     and (p_matter is null or c.matter_id = p_matter)
     -- Client : accès actif au dossier et session MFA (via can_read_matter) ; jamais le personnel ici.
     and not private.is_staff()
     and private.can_read_matter(c.matter_id)
   order by c.starts_at
   limit 100
$$;
revoke all on function public.client_court_dates(uuid) from public, anon;
grant execute on function public.client_court_dates(uuid) to authenticated;

-- Réservation d'un rappel (serveur seulement) : true si ce rappel n'avait pas encore été envoyé.
create or replace function public.claim_court_date_reminder(p_court_date uuid, p_user uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
begin
  insert into private.court_date_reminders (court_date_id, user_id, kind)
    values (p_court_date, p_user, p_kind)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;
revoke all on function public.claim_court_date_reminder(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_court_date_reminder(uuid, uuid, text) to service_role;
