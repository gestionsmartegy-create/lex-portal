-- Connexion des agendas (ADR 0031) : connexion, plages occupées, conflits, déconnexion, retour Clio.
begin;
\ir _fixture.psql
select plan(35);

-- Date de cour du dossier 1 (équipe : Wilson …0b), dans 3 jours, 10 h → 11 h UTC, Wilson présent.
insert into public.court_dates (id, matter_id, kind, starts_at, ends_at, timezone, status)
values
  ('c0000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', 'hearing',
   date_trunc('day', now()) + interval '3 days 10 hours', date_trunc('day', now()) + interval '3 days 11 hours',
   'America/Halifax', 'confirmed'),
  ('c0000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', 'motion',
   date_trunc('day', now()) + interval '4 days 14 hours', date_trunc('day', now()) + interval '4 days 15 hours',
   'America/Halifax', 'scheduled');
insert into public.court_date_attendees (court_date_id, user_id) values
  ('c0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000b');

-- Tables privées : jamais lisibles par un utilisateur.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select * from private.calendar_connections $$, '42501', null, 'connexions : table privée');
select throws_ok($$ select * from private.calendar_busy_blocks $$, '42501', null, 'plages occupées : table privée');
-- Enregistrer une connexion ou lire un jeton : serveur seulement.
select throws_ok($$ select public.calendar_save_connection('00000000-0000-0000-0000-00000000000b', true, null, '{}') $$,
  '42501', null, 'personnel : n''enregistre pas une connexion lui-même');
select throws_ok($$ select public.calendar_read_tokens('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'personnel : ne lit pas de jeton');
select throws_ok($$ select public.court_date_apply_clio_change('c0000000-0000-0000-0000-0000000000d1', 'deleted', null, null) $$,
  '42501', null, 'personnel : n''applique pas un changement Clio');
select tests.clear_authentication();

-- Serveur : connexion de Wilson (simulateur, sans jeton) ; refus pour un client.
set local role service_role;
select lives_ok($$ select public.calendar_save_connection('00000000-0000-0000-0000-00000000000b', true, null, '{Calendars.ReadBasic}') $$,
  'serveur : connexion du personnel actif');
select throws_ok($$ select public.calendar_save_connection('00000000-0000-0000-0000-000000000001', true, null, '{}') $$,
  '42501', null, 'serveur : pas de connexion d''agenda pour un client');
select lives_ok($$ select public.calendar_save_connection('00000000-0000-0000-0000-00000000000c', false, '{"access_token":"x"}', '{}') $$,
  'serveur : connexion avec jeton (coffre)');
select is(public.calendar_read_tokens('00000000-0000-0000-0000-00000000000c'), '{"access_token":"x"}', 'serveur : jeton relu du coffre');
-- Plages occupées de Wilson : une qui chevauche la date d1, une identique à d2 (recopiée par Clio).
select is(public.calendar_store_busy('00000000-0000-0000-0000-00000000000b', now() - interval '1 day', now() + interval '30 days',
  jsonb_build_array(
    jsonb_build_object('start', date_trunc('day', now()) + interval '3 days 10 hours 30 minutes',
                       'end', date_trunc('day', now()) + interval '3 days 12 hours'),
    jsonb_build_object('start', date_trunc('day', now()) + interval '4 days 14 hours',
                       'end', date_trunc('day', now()) + interval '4 days 15 hours'))), 2, 'serveur : plages enregistrées');
select throws_ok($$ select public.calendar_store_busy('00000000-0000-0000-0000-00000000000b', now(), now() + interval '90 days', '[]') $$,
  '22023', null, 'serveur : période de plus de 62 jours refusée');
reset role;

-- Wilson : voit sa connexion et le conflit avec Outlook (pas la plage identique à l'audience).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*)::int from public.my_calendar_connection()), 1, 'personnel : voit sa connexion');
select is((select array_agg(court_date_id::text) from public.court_date_busy_conflicts(now(), now() + interval '30 days')),
  array['c0000000-0000-0000-0000-0000000000d1'], 'conflit Outlook : chevauchement, sauf l''audience recopiée');
select throws_ok($$ select * from public.calendar_connection_list() $$, '42501', null, 'personnel : pas la liste du cabinet');
select is(public.calendar_set_reminders(true), true, 'personnel : active ses rappels');
select tests.clear_authentication();

-- Autre membre du personnel (hors équipe) : ni le conflit, ni la connexion de Wilson, ni la coupure.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.court_date_busy_conflicts(now(), now() + interval '30 days')), 0,
  'hors équipe : aucun conflit visible');
select is((select count(*)::int from public.my_calendar_connection() where is_mock), 0, 'hors équipe : seulement sa connexion');
select throws_ok($$ select public.calendar_disconnect('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'personnel : ne coupe pas l''agenda d''un autre');
select tests.clear_authentication();

-- Client : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.calendar_disconnect('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'client : ne coupe pas un agenda');
select is((select count(*)::int from public.my_calendar_connection()), 0, 'client : aucune connexion');
select is((select count(*)::int from public.court_date_busy_conflicts(now(), now() + interval '30 days')), 0, 'client : aucun conflit');
select tests.clear_authentication();

set local role anon;
select throws_ok($$ select public.calendar_disconnect('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'anon : aucun accès');
reset role;

-- Rappels : J-1 seulement pour d1 et d2 (J-7 déjà passé).
set local role service_role;
select is((select count(*)::int from public.calendar_reminder_plan('00000000-0000-0000-0000-00000000000b')
           where desired_start is not null), 2, 'rappels : J-1 des deux dates');
reset role;

-- Admin : voit et coupe une connexion (journalisé).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select is((select count(*)::int from public.calendar_connection_list()), 2, 'admin : toutes les connexions');
select is(public.calendar_disconnect('00000000-0000-0000-0000-00000000000c'), true, 'admin : coupe une connexion');
select tests.clear_authentication();
select is((select count(*)::int from vault.secrets where name = 'calendar:00000000-0000-0000-0000-00000000000c'), 0,
  'coupure : jeton supprimé du coffre');

-- Compte suspendu : déconnexion automatique, plages supprimées, journalisée.
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from private.calendar_connections) + (select count(*)::int from private.calendar_busy_blocks), 0,
  'suspension : connexion et plages supprimées');
select ok(exists (select 1 from audit.events where action = 'calendar.disconnected'
                   and resource_id = '00000000-0000-0000-0000-00000000000b' and metadata->>'reason' = 'deactivated'),
  'suspension : déconnexion journalisée');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-00000000000b';

-- Retour Clio : date déplacée (confirmée → à confirmer), date supprimée (annulée).
update public.court_dates set clio_sync_status = 'synced', clio_calendar_entry_id = '42'
 where id in ('c0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000d2');
set local role service_role;
select is(public.court_date_apply_clio_change('c0000000-0000-0000-0000-0000000000d1', 'moved',
  date_trunc('day', now()) + interval '5 days 13 hours', null), true, 'Clio : date déplacée appliquée');
select is(public.court_date_apply_clio_change('c0000000-0000-0000-0000-0000000000d2', 'deleted', null, null), true,
  'Clio : date supprimée appliquée');
reset role;
select is((select status || '/' || clio_change from public.court_dates where id = 'c0000000-0000-0000-0000-0000000000d1')
       || ' ' || (select status || '/' || clio_change from public.court_dates where id = 'c0000000-0000-0000-0000-0000000000d2'),
  'scheduled/moved scheduled/deleted', 'Clio : déplacée et introuvable, à confirmer et signalées (jamais annulée)');
set local role service_role;
select is(public.court_date_apply_clio_change('c0000000-0000-0000-0000-0000000000d2', 'deleted', null, null), false,
  'Clio : une entrée introuvable n''est signalée qu''une fois');
reset role;

-- Les colonnes du signalement ne s'écrivent jamais par l'équipe.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ update public.court_dates set clio_change = null where id = 'c0000000-0000-0000-0000-0000000000d2' $$,
  '42501', null, 'équipe : n''efface pas le signalement Clio directement');
select tests.clear_authentication();

-- L'équipe confirme de nouveau : le signalement disparaît.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
update public.court_dates set status = 'confirmed' where id = 'c0000000-0000-0000-0000-0000000000d1';
select tests.clear_authentication();
select is((select clio_change from public.court_dates where id = 'c0000000-0000-0000-0000-0000000000d1'), null,
  'confirmation : signalement Clio retiré');

-- Profil supprimé : le jeton ne reste pas dans le coffre.
set local role service_role;
select public.calendar_save_connection('00000000-0000-0000-0000-00000000000c', false, '{"access_token":"y"}', '{}');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select is((select count(*)::int from vault.secrets where name = 'calendar:00000000-0000-0000-0000-00000000000c'), 0,
  'profil supprimé : jeton retiré du coffre');

select * from finish();
rollback;
