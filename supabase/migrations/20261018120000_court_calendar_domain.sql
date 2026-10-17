-- Calendrier de cour : domaine du dossier pour la légende de couleurs (ADR 0030).
-- court_calendar_feed renvoie en plus le code du type et le groupe de pratique (legal, business,
-- advisory) : aucune donnée sensible, seulement la catégorie du dossier. Le reste est inchangé
-- (colonnes limitées, 62 jours, 500 lignes, équipe / firm_admin / adjoint·e désigné·e).
-- Le type de retour change : la fonction est recréée avec les mêmes droits.

drop function public.court_calendar_feed(timestamptz, timestamptz);

create function public.court_calendar_feed(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, matter_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz,
  all_day boolean, timezone text, court_id uuid, room text,
  display_number text, title text, office_id uuid, attendee_ids uuid[], on_team boolean,
  type_code text, practice_group text
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
         t.practice_group
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
