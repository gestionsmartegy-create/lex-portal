-- Vues enregistrées du portefeuille (ADR 0023) : personnelles, réservées au personnel.
begin;
\ir _fixture.psql
select plan(16);

select has_table('public', 'matter_saved_views', 'table des vues enregistrées');
select ok((select relrowsecurity from pg_class where oid = 'public.matter_saved_views'::regclass), 'RLS active');

-- Personnel : crée ses vues, l'auteur est posé par la base.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_saved_views (name, query) values ('Mes urgents', 'alert=overdue&view=board') $$,
  'personnel : enregistre une vue');
select throws_ok($$ insert into public.matter_saved_views (name, query) values ('Injection', 'a=<script>') $$,
  '23514', null, 'requête hors du jeu de caractères permis : refusée');
select throws_ok($$ insert into public.matter_saved_views (owner_id, name, query)
  values ('00000000-0000-0000-0000-00000000000c', 'Pour un autre', 'q=x') $$,
  '42501', null, 'personnel : pas de vue au nom d''un autre');
select is((select count(*)::int from public.matter_saved_views), 1, 'personnel : voit sa vue');
select tests.clear_authentication();
select is((select owner_id from public.matter_saved_views where name = 'Mes urgents'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'propriétaire posé par la base');

-- Autre membre du personnel : ne voit ni ne supprime la vue d'un collègue.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.matter_saved_views), 0, 'collègue : ne voit pas la vue');
delete from public.matter_saved_views;
select tests.clear_authentication();
select is((select count(*)::int from public.matter_saved_views), 1, 'collègue : ne supprime pas la vue');

-- Client (même avec MFA) : aucune vue, aucune création.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_saved_views), 0, 'client : aucune vue');
select throws_ok($$ insert into public.matter_saved_views (name, query) values ('Client', 'q=x') $$,
  '42501', null, 'client : ne crée pas de vue');
select tests.clear_authentication();

-- Personnel connecté par mot de passe (même avec MFA) : aucun droit (ADR 0009).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2', 'password');
select is((select count(*)::int from public.matter_saved_views), 0, 'personnel par mot de passe : aucune vue');
select throws_ok($$ insert into public.matter_saved_views (name, query) values ('Mdp', 'q=x') $$,
  '42501', null, 'personnel par mot de passe : ne crée pas de vue');
select tests.clear_authentication();

-- Propriétaire : pas de modification (droit non accordé) ; plafond de 20 vues garanti par la base.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ update public.matter_saved_views set name = 'Renommée' $$, '42501', null,
  'propriétaire : pas de modification');
select lives_ok($$ insert into public.matter_saved_views (name, query)
  select 'Vue ' || g, 'q=' || g from generate_series(2, 20) g $$, 'jusqu''à 20 vues');
select throws_ok($$ insert into public.matter_saved_views (name, query) values ('Vue 21', 'q=21') $$,
  'P0001', null, '21e vue refusée par la base');
select tests.clear_authentication();

select * from finish();
rollback;
