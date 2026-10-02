-- Revue de sécurité J3 : domaine du personnel à la création, vérification de limite.
begin;
\ir _fixture.psql
select plan(10);

select throws_ok($$ insert into auth.users (id, email, raw_app_meta_data, aud, role)
  values (gen_random_uuid(), 'invite.client@lexcanadalaw.com', '{"provider":"email"}', 'authenticated', 'authenticated') $$,
  '42501', null, 'M3 · compte e-mail sur le domaine du cabinet refusé (invitation client)');

select ok(not has_function_privilege('authenticated', 'public.authorize_staff_provisioning(text, public.app_role, uuid)', 'EXECUTE'),
  'M3 · autorisation de pré-création réservée au serveur');
select public.authorize_staff_provisioning('pre.cree@lexcanadalaw.com', 'firm_admin', null);
select lives_ok($$ insert into auth.users (id, email, raw_app_meta_data, aud, role)
  values ('00000000-0000-0000-0000-0000000000f1', 'pre.cree@lexcanadalaw.com', '{"provider":"email"}', 'authenticated', 'authenticated') $$,
  'M3 · pré-création autorisée acceptée');
select is((select role::text || '/' || status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'),
  'firm_admin/active', 'M3 · le compte pré-créé reçoit le rôle prévu');
select throws_ok($$ insert into auth.users (id, email, raw_app_meta_data, aud, role)
  values (gen_random_uuid(), 'pre.cree@LEXCANADALAW.com', '{"provider":"email"}', 'authenticated', 'authenticated') $$,
  null, null, 'M3 · une autorisation ne sert qu''une fois');
select throws_ok($$ select public.authorize_staff_provisioning('x@gmail.com', 'staff', null) $$, '22023', null,
  'M3 · pas d''autorisation hors domaine du cabinet');

select ok(not has_function_privilege('authenticated', 'public.rate_limit_check(text, integer, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rate_limit_check(text, integer, integer)', 'EXECUTE'),
  'F3 · rate_limit_check réservé au serveur');
select ok(public.rate_limit_check('j3:k', 2, 60), 'F3 · aucun essai : autorisé');
select public.rate_limit_hit('j3:k', 2, 60); select public.rate_limit_hit('j3:k', 2, 60);
select ok(not public.rate_limit_check('j3:k', 2, 60), 'F3 · limite atteinte : refusé');
select is((select hits from private.rate_limit_buckets where key = 'j3:k'), 2, 'F3 · la vérification n''incrémente pas');

select * from finish();
rollback;
