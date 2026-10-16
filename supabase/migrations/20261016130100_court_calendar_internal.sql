-- Dates de cour (ADR 0025) : lecture du calendrier Clio par la synchronisation (service_role seulement).
-- public.clio_court_calendar() répond aux seuls membres du personnel connectés ; le planificateur
-- et l'écriture vers Clio passent par cette variante, jamais exposée aux utilisateurs.
create or replace function public.clio_court_calendar_internal()
returns bigint language sql stable security definer set search_path = '' as $$
  select (c.settings ->> 'court_calendar_id')::bigint from private.integration_connections c
   where c.provider = 'clio_manage' and c.region = 'ca'
$$;
revoke all on function public.clio_court_calendar_internal() from public, anon, authenticated;
grant execute on function public.clio_court_calendar_internal() to service_role;
