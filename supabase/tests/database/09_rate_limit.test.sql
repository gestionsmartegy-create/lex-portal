-- J3 : limitation de débit et relais d'audit serveur (ADR 0010).
begin;
\ir _fixture.psql
select plan(14);

select ok(not has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'EXECUTE'),
  'rate_limit_hit inaccessible à anon');
select ok(not has_function_privilege('authenticated', 'public.rate_limit_hit(text, integer, integer)', 'EXECUTE'),
  'rate_limit_hit inaccessible à authenticated (serveur uniquement)');
select ok(has_function_privilege('service_role', 'public.rate_limit_hit(text, integer, integer)', 'EXECUTE'),
  'rate_limit_hit exécutable par service_role');

select is(array[public.rate_limit_hit('test:k', 2, 60), public.rate_limit_hit('test:k', 2, 60),
                public.rate_limit_hit('test:k', 2, 60)],
  array[true, true, false], 'Deux essais permis, le troisième refusé dans la fenêtre');

-- Fenêtre écoulée : remise à zéro
update private.rate_limit_buckets set window_start = now() - interval '2 minutes' where key = 'test:k';
select ok(public.rate_limit_hit('test:k', 2, 60), 'Après la fenêtre, le compteur repart à zéro');
select is((select hits from private.rate_limit_buckets where key = 'test:k'), 1, 'Compteur réinitialisé à 1');

select throws_ok($$ select public.rate_limit_hit(repeat('x', 300), 1, 60) $$, '22023', null,
  'Clé trop longue refusée');

select ok(not has_function_privilege('authenticated',
  'public.record_audit_event(text, text, text, uuid, jsonb, uuid, inet, text, text)', 'EXECUTE')
  and not has_function_privilege('anon',
  'public.record_audit_event(text, text, text, uuid, jsonb, uuid, inet, text, text)', 'EXECUTE'),
  'record_audit_event inaccessible à anon et authenticated (pas de faux événements)');
select ok(public.record_audit_event('auth.login', 'session', null, null, '{}', '00000000-0000-0000-0000-000000000001') > 0,
  'record_audit_event écrit dans audit.events');
select is((select actor_email from audit.events where action = 'auth.login' order by id desc limit 1),
  'john@example.com', 'L''acteur est résolu depuis le profil');

-- current_session_role : le rôle tel que la RLS le voit
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is(public.current_session_role(), null, 'Client sans MFA : aucun rôle effectif');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is(public.current_session_role()::text, 'client', 'Client avec MFA : rôle client');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2', 'password');
select is(public.current_session_role(), null, 'Personnel sans Microsoft : aucun rôle effectif');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select is(public.current_session_role()::text, 'firm_admin', 'firm_admin via Microsoft : rôle effectif');
select tests.clear_authentication();

select * from finish();
rollback;
