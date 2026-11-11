-- Agendas Outlook réels (ADR 0043) : renouvellement des jetons d'une connexion active.
begin;
\ir _fixture.psql
select plan(10);

-- Personne ne renouvelle un jeton depuis le navigateur.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.calendar_update_tokens('00000000-0000-0000-0000-00000000000b', '{"access_token":"z"}') $$,
  '42501', null, 'personnel : ne renouvelle pas un jeton lui-même');
select tests.clear_authentication();
set local role anon;
select throws_ok($$ select public.calendar_update_tokens('00000000-0000-0000-0000-00000000000b', '{"access_token":"z"}') $$,
  '42501', null, 'anonyme : aucun accès');
reset role;

set local role service_role;
-- Sans connexion : rien à renouveler.
select is(public.calendar_update_tokens('00000000-0000-0000-0000-00000000000c', '{"access_token":"z"}'), false,
  'serveur : pas de connexion, pas de renouvellement');
-- Connexion du simulateur (sans jeton) : jamais de jeton réel dedans.
select public.calendar_save_connection('00000000-0000-0000-0000-00000000000b', true, null, '{Calendars.ReadBasic}');
select is(public.calendar_update_tokens('00000000-0000-0000-0000-00000000000b', '{"access_token":"z"}'), false,
  'serveur : une connexion du simulateur ne reçoit pas de jeton');
-- Connexion réelle : le coffre est remplacé, la date de connexion et le journal ne bougent pas.
select public.calendar_save_connection('00000000-0000-0000-0000-00000000000c', false, '{"access_token":"x"}', '{}');
reset role;
create temporary table before_refresh as
  select c.connected_at,
         (select count(*) from audit.events e where e.action = 'calendar.connected') as audits
    from private.calendar_connections c where c.user_id = '00000000-0000-0000-0000-00000000000c';
set local role service_role;
select is(public.calendar_update_tokens('00000000-0000-0000-0000-00000000000c', '{"access_token":"y"}'), true,
  'serveur : jeton renouvelé');
select is(public.calendar_read_tokens('00000000-0000-0000-0000-00000000000c'), '{"access_token":"y"}',
  'serveur : nouveau jeton relu du coffre');
select throws_ok($$ select public.calendar_update_tokens('00000000-0000-0000-0000-00000000000c', '') $$,
  '22023', null, 'serveur : contenu vide refusé');
reset role;
select is((select c.connected_at from private.calendar_connections c
            where c.user_id = '00000000-0000-0000-0000-00000000000c'),
          (select connected_at from before_refresh), 'la date de connexion ne change pas');
select is((select count(*) from audit.events e where e.action = 'calendar.connected'),
          (select audits from before_refresh), 'aucune ligne d''audit « connecté » en plus');

-- Connexion « à reconnecter » (accès retiré par Microsoft) : plus aucun jeton accepté.
set local role service_role;
select public.calendar_report_error('00000000-0000-0000-0000-00000000000c', 'TOKEN_REVOKED');
select is(public.calendar_update_tokens('00000000-0000-0000-0000-00000000000c', '{"access_token":"w"}'), false,
  'serveur : une connexion à reconnecter ne reçoit pas de jeton');
reset role;

select * from finish();
rollback;
