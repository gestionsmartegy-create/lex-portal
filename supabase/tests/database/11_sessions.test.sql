-- J3.2 : expiration des sessions imposée par le serveur (ADR 0012).
begin;
\ir _fixture.psql
select plan(12);

create function pg_temp.as_session(p_user uuid, p_session text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2', 'session_id', p_session)::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Droits
select ok(not has_function_privilege('anon', 'public.touch_session()', 'EXECUTE'), 'anon ne peut pas toucher une session');
select ok(has_function_privilege('authenticated', 'public.touch_session()', 'EXECUTE'), 'un utilisateur connecté peut signaler son activité');
select ok(not has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'EXECUTE'), 'révocation réservée au serveur');
select ok(not has_table_privilege('authenticated', 'private.session_activity', 'SELECT'), 'table d''activité inaccessible par l''API');

-- Première activité, puis activité normale
select pg_temp.as_session('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
select is(public.touch_session(), 'active', 'nouvelle session : active');
select is(public.touch_session(), 'active', 'activité récente : active');

-- Session sans identifiant ou mal formée : refusée
select pg_temp.as_session('b0000000-0000-4000-8000-000000000001', '');
select is(public.touch_session(), 'expired', 'JWT sans session_id : expired');
select pg_temp.as_session('b0000000-0000-4000-8000-000000000001', 'pas-un-uuid');
select is(public.touch_session(), 'expired', 'session_id invalide : expired');

-- Session d'un autre utilisateur (JWT incohérent) : refusée
select pg_temp.as_session('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111');
select is(public.touch_session(), 'expired', 'session appartenant à un autre compte : expired');

-- Inactivité de 33 min
select tests.clear_authentication();
update private.session_activity set last_seen_at = now() - interval '33 minutes'
 where session_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.as_session('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
select is(public.touch_session(), 'expired', 'inactivité > 32 min : expired (pas de prolongation)');

-- Durée maximale de 12 h, même avec une activité récente
select tests.clear_authentication();
insert into private.session_activity (session_id, user_id, created_at, last_seen_at)
values ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', now() - interval '13 hours', now());
select pg_temp.as_session('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222');
select is(public.touch_session(), 'expired', 'session de plus de 12 h : expired');

-- Révocation par le serveur
select tests.clear_authentication();
select public.revoke_user_sessions('b0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from private.session_activity where user_id = 'b0000000-0000-4000-8000-000000000001'),
  0, 'révocation : plus aucune activité enregistrée');

select * from finish();
rollback;
