-- Suivi du dossier (ADR 0018) : étapes gérées par l'équipe, avancement calculé, équipe gérée par le firm_admin.
begin;
\ir _fixture.psql
select plan(29);

-- Droits de la fonction
select ok(not has_function_privilege('anon', 'public.move_timeline_step(uuid, integer)', 'EXECUTE'), 'anon : ne peut pas réordonner');
select ok(has_function_privilege('authenticated', 'public.move_timeline_step(uuid, integer)', 'EXECUTE'), 'authenticated : peut appeler (RLS derrière)');

-- Équipe du dossier 1 (Wilson, session Microsoft) : ajoute, termine, réordonne.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_timeline_steps (id, matter_id, position, title) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Ouverture'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Dépôt'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3, 'Décision') $$,
  'équipe : ajoute des étapes');
select lives_ok($$ update public.matter_timeline_steps set is_completed = true, completed_at = now()
  where id = '30000000-0000-0000-0000-000000000001' $$, 'équipe : termine une étape');
select is(public.move_timeline_step('30000000-0000-0000-0000-000000000003', -1), true, 'équipe : monte une étape');
select is((select position::int from public.matter_timeline_steps where id = '30000000-0000-0000-0000-000000000003'), 2, 'étape montée en position 2');
select is((select position::int from public.matter_timeline_steps where id = '30000000-0000-0000-0000-000000000002'), 3, 'voisine descendue en position 3');
select is(public.move_timeline_step('30000000-0000-0000-0000-000000000001', -1), false, 'la première étape ne peut pas monter');
select throws_ok($$ update public.matter_timeline_steps set matter_id = '10000000-0000-0000-0000-000000000002'
  where id = '30000000-0000-0000-0000-000000000001' $$, '42501', null, 'une étape ne change jamais de dossier');
select tests.clear_authentication();

select is((select progress_percent::int from public.matters where id = '10000000-0000-0000-0000-000000000001'), 33, 'avancement : 1 étape sur 3 = 33 %');

-- Client du dossier (lecture et réponse) : lit, mais ne modifie rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001'), 3, 'client : voit les étapes de son dossier');
select throws_ok($$ insert into public.matter_timeline_steps (matter_id, position, title)
  values ('10000000-0000-0000-0000-000000000001', 9, 'Intrus') $$, '42501', null, 'client : ne peut pas ajouter');
select lives_ok($$ delete from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001' $$,
  'client : suppression sans effet');
select lives_ok($$ update public.matter_timeline_steps set title = 'Modifié'
  where matter_id = '10000000-0000-0000-0000-000000000001' $$, 'client : modification sans effet');
select is(public.move_timeline_step('30000000-0000-0000-0000-000000000002', -1), false, 'client : ne peut pas réordonner');
select throws_ok($$ insert into public.matter_team (matter_id, user_id)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') $$, '42501', null,
  'client : ne peut pas modifier l''équipe');
select tests.clear_authentication();
select is((select count(*)::int from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001'), 3, 'client : aucune étape supprimée');
select is((select count(*)::int from public.matter_timeline_steps where title = 'Modifié'), 0, 'client : aucune étape modifiée');

-- Personnel hors équipe : aucune modification.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select lives_ok($$ delete from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001' $$,
  'personnel hors équipe : suppression sans effet');
select tests.clear_authentication();
select is((select count(*)::int from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001'), 3, 'personnel hors équipe : aucune étape supprimée');

-- Membre de l'équipe connecté par mot de passe : aucun droit du personnel (ADR 0009).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2', 'password');
select lives_ok($$ delete from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001' $$,
  'équipe par mot de passe : suppression sans effet');
select tests.clear_authentication();
select is((select count(*)::int from public.matter_timeline_steps where matter_id = '10000000-0000-0000-0000-000000000001'), 3, 'équipe par mot de passe : aucune étape supprimée');

-- Équipe : suppression d'une étape, avancement recalculé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ delete from public.matter_timeline_steps where id = '30000000-0000-0000-0000-000000000002' $$,
  'équipe : supprime une étape');
select throws_ok($$ insert into public.matter_team (matter_id, user_id)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') $$, '42501', null,
  'membre de l''équipe : ne peut pas ajouter un collègue');
select tests.clear_authentication();
select is((select progress_percent::int from public.matters where id = '10000000-0000-0000-0000-000000000001'), 50, 'avancement recalculé : 1 étape sur 2 = 50 %');

-- Équipe du dossier : seul le firm_admin la modifie.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_team (matter_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'collaborator') $$,
  'firm_admin : ajoute un membre à l''équipe');
-- Même le firm_admin (qui peut modifier les deux dossiers) ne déplace pas une étape vers un autre dossier.
select throws_ok($$ update public.matter_timeline_steps set matter_id = '10000000-0000-0000-0000-000000000002'
  where id = '30000000-0000-0000-0000-000000000001' $$, '42501', 'Une étape ne peut pas changer de dossier',
  'firm_admin : une étape ne change jamais de dossier');
select tests.clear_authentication();

-- Journal : chaque changement est tracé, sans texte libre.
select ok((select count(*) from audit.events where action like 'matter_timeline.%') >= 5, 'audit : changements d''étapes journalisés');
select is((select count(*)::int from audit.events where action like 'matter_timeline.%' and metadata <> '{}'::jsonb), 0, 'audit : aucun titre ni description');

select * from finish();
rollback;
