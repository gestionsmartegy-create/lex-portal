-- Journal d'audit : alimenté automatiquement, lisible par le firm_admin seul,
-- append-only même pour le propriétaire. Scénarios : T16, T17, T28, T30.
begin;
\ir _fixture.psql
select plan(7);

select ok(exists (select 1 from audit.events where action = 'matter_access.granted'),
  'T28 · les octrois d''accès sont journalisés automatiquement');
select ok(exists (select 1 from audit.events where action = 'matter_team.added'),
  'T28 · les affectations d''équipe sont journalisées');
select ok(exists (select 1 from audit.events where action = 'profile.role_status_changed'),
  'T28 · les changements de rôle et de statut sont journalisés');

select throws_ok($$ delete from audit.events $$, 'P0001', null, 'T30 · DELETE interdit, même pour le propriétaire');
select throws_ok($$ update audit.events set action = 'x.y' $$, 'P0001', null, 'T30 · UPDATE interdit');

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select * from public.list_audit_events() $$, '42501', null,
  'T16 · un client ne peut pas lire l''audit');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1');
select ok((select count(*) from public.list_audit_events(50)) > 0, 'T17 · le firm_admin lit l''audit via la RPC');
select tests.clear_authentication();

select * from finish();
rollback;
