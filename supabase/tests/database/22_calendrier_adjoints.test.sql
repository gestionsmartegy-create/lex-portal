-- Calendrier de cour, accès des adjoint·e·s (ADR 0027) : tout le cabinet en colonnes limitées,
-- sans accès aux notes ni au dossier ; désignation par le firm_admin seulement.
begin;
\ir _fixture.psql
select plan(20);

-- Une date sur le dossier de l'équipe du 0b (matter 0001), avec une note interne.
insert into public.court_dates (id, matter_id, kind, starts_at, timezone, notes, virtual_link, mode)
  values ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'hearing',
          '2026-12-15 14:30+00', 'America/Toronto', 'Note interne secrète', 'https://meet.example.com/x', 'virtual');

-- Personnel hors équipe, non désigné : rien.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.court_calendar_feed('2026-12-01', '2026-12-31')), 0,
  'personnel hors équipe non désigné : aucune date');
select throws_ok($$ insert into public.court_calendar_viewers (user_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'personnel : ne se désigne pas lui-même');
select tests.clear_authentication();

-- firm_admin : désigne le 0c (adjoint·e) ; un client est refusé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ insert into public.court_calendar_viewers (user_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  'firm_admin : désigne un·e adjoint·e');
select throws_ok($$ insert into public.court_calendar_viewers (user_id) values ('00000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'un client ne peut pas être désigné');
select is((select count(*)::int from public.court_calendar_feed('2026-12-01', '2026-12-31')), 1,
  'firm_admin : voit la date');
select tests.clear_authentication();
select ok(exists (select 1 from audit.events where action = 'court_calendar.viewer_added'), 'désignation journalisée');

-- Adjoint·e désigné·e : voit la date de tout le cabinet, sans être de l'équipe.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.court_calendar_feed('2026-12-01', '2026-12-31')), 1,
  'adjoint·e : voit la date d''une autre équipe');
select is((select on_team from public.court_calendar_feed('2026-12-01', '2026-12-31') limit 1), false,
  'adjoint·e : hors de l''équipe (pas de lien vers le dossier)');
select is((select title from public.court_calendar_feed('2026-12-01', '2026-12-31') limit 1), null,
  'adjoint·e : pas le titre du dossier hors équipe (seulement le numéro)');
select is((select count(*)::int from public.court_dates), 0, 'adjoint·e : aucune lecture directe (notes, lien virtuel)');
select is((select count(*)::int from public.matters where id = '10000000-0000-0000-0000-000000000001'), 0,
  'adjoint·e : n''ouvre pas le dossier');
update public.court_dates set room = 'X' where id = 'c0000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.court_calendar_feed('2026-01-01', '2026-12-31')), 0,
  'période de plus de 62 jours refusée (aucune ligne)');
select tests.clear_authentication();
select is((select room from public.court_dates where id = 'c0000000-0000-0000-0000-0000000000a1'), null,
  'adjoint·e : aucune modification (la date ne change pas)');

-- Personne connectée par mot de passe ou client : rien.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal2', 'password');
select is((select count(*)::int from public.court_calendar_feed('2026-12-01', '2026-12-31')), 0,
  'personnel connecté par mot de passe : rien');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.court_calendar_feed('2026-12-01', '2026-12-31')), 0, 'client : rien');
select tests.clear_authentication();

-- Personnel non firm_admin : ne retire pas une désignation.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
delete from public.court_calendar_viewers where user_id = '00000000-0000-0000-0000-00000000000c';
select tests.clear_authentication();
select is((select count(*)::int from public.court_calendar_viewers), 1, 'personnel : ne retire pas une désignation');

-- firm_admin : retire la désignation (journalisée) ; une personne inactive ne peut pas être désignée.
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000b';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
delete from public.court_calendar_viewers where user_id = '00000000-0000-0000-0000-00000000000c';
select throws_ok($$ insert into public.court_calendar_viewers (user_id) values ('00000000-0000-0000-0000-00000000000b') $$,
  '23514', null, 'personne inactive : ne peut pas être désignée');
select tests.clear_authentication();
select is((select count(*)::int from public.court_calendar_viewers), 0, 'firm_admin : retire la désignation');
select ok(exists (select 1 from audit.events where action = 'court_calendar.viewer_removed'), 'retrait journalisé');

-- Anonyme : pas d'appel possible.
set local role anon;
select throws_ok($$ select * from public.court_calendar_feed('2026-12-01', '2026-12-31') $$, '42501', null,
  'anonyme : pas d''accès au calendrier');
reset role;

select * from finish();
rollback;
