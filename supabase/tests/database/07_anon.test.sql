-- Visiteur non connecté (anon) : aucun accès aux données ni aux RPC. Scénario : T31.
begin;
\ir _fixture.psql
select plan(4);

select tests.as_anon();
select throws_ok($$ select 1 from public.matters $$, '42501', null, 'T31 · anon ne lit pas les dossiers');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'T31 · anon ne lit pas les profils');
select throws_ok($$ select * from public.client_dashboard_counts() $$, '42501', null, 'anon ne peut pas appeler client_dashboard_counts');
select throws_ok($$ select * from public.list_audit_events() $$, '42501', null, 'anon ne peut pas appeler list_audit_events');
select tests.clear_authentication();

select * from finish();
rollback;
