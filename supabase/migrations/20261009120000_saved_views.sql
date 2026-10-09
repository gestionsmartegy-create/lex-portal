-- Vues enregistrées du portefeuille des dossiers (ADR 0023, plan phase 2).
-- Une vue = un nom + les filtres du portefeuille (chaîne de requête canonique, revalidée par le serveur).
-- Personnelles : chaque membre du cabinet ne voit, ne crée et ne supprime que les siennes.

create table public.matter_saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  query      text not null check (length(query) <= 500 and query ~ '^[A-Za-z0-9=&%._~+-]*$'),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
create index matter_saved_views_owner_idx on public.matter_saved_views (owner_id, created_at);

alter table public.matter_saved_views enable row level security;

create policy matter_saved_views_select on public.matter_saved_views for select to authenticated
  using (owner_id = (select auth.uid()) and private.is_staff());
create policy matter_saved_views_insert on public.matter_saved_views for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_staff());
create policy matter_saved_views_delete on public.matter_saved_views for delete to authenticated
  using (owner_id = (select auth.uid()) and private.is_staff());

grant select, insert, delete on public.matter_saved_views to authenticated;
