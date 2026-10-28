-- ADR 0038 : l'unicité de l'entrée Clio est vérifiée par court_date_import_clio (« déjà importée ») ;
-- une date remise peut garder la même entrée que la date qu'elle remplace. Index simple de recherche.
drop index if exists public.court_dates_clio_entry_key;
create index court_dates_clio_entry_idx on public.court_dates (clio_calendar_entry_id)
  where clio_calendar_entry_id is not null;
