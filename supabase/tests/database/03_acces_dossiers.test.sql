-- Accès aux dossiers : isolation entre clients, MFA, équipe, révocation.
-- Scénarios : T3–T8, T22–T25, T27, T29 · security.md 1, 2, 7, 10, 12.
begin;
\ir _fixture.psql
select plan(17);

-- T3 / T4 : garde-fous d'attribution (exécutés comme serveur)
select throws_ok(
  $$ insert into public.matter_team values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'collaborator') $$,
  'P0001', null, 'T3 · un client ne peut pas être membre d''une équipe');
select throws_ok(
  $$ insert into public.matter_access (matter_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') $$,
  'P0001', null, 'T4 · matter_access réservé aux clients');

-- T5 : le firm_admin voit tout
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1');
select is((select count(*) from public.matters), 2::bigint, 'T5 · firm_admin voit tous les dossiers');
select tests.clear_authentication();

-- T6 : sans MFA (aal1), un client ne voit rien
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*) from public.matters), 99::bigint, 'T6 · CONTRE-ÉPREUVE (doit échouer)');
select tests.clear_authentication();

-- T7 / T8 · security.md 1 : isolation entre clients
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select results_eq($$ select display_number from public.matters $$, $$ values ('LC-2026-0142'::text) $$,
  'T7 · le client voit uniquement son dossier');
select is((select count(*) from public.matters where id = '10000000-0000-0000-0000-000000000002'), 0::bigint,
  'T8 · security.md 1 · le dossier d''un autre client est invisible (même par identifiant)');
select is((select count(*) from public.matter_access where user_id <> auth.uid()), 0::bigint,
  'T8 · le client ne voit pas les accès des autres');
select tests.clear_authentication();

-- security.md 12 : accès en lecture seule qui tente d'écrire
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok(
  $$ insert into public.conversations (matter_id, scope, created_by) values ('10000000-0000-0000-0000-000000000002', 'matter', auth.uid()) $$,
  '42501', null, 'security.md 12 · accès read : écriture refusée');
-- security.md 10 : un client n'a aucun droit d'administration
select throws_ok(
  $$ insert into public.matter_access (matter_id, user_id) values ('10000000-0000-0000-0000-000000000002', auth.uid()) $$,
  '42501', null, 'security.md 10 · un client ne peut pas s''octroyer un accès');
select tests.clear_authentication();

-- T22 / T24 : personnel de l'équipe
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1');
select is((select count(*) from public.matters), 1::bigint, 'T22 · le personnel voit les dossiers de son équipe');
select throws_ok(
  $$ insert into public.matter_access (matter_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'T24 · le personnel ne peut pas octroyer d''accès (firm_admin seulement)');
select tests.clear_authentication();

-- T25 : personnel hors équipe
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1');
select is((select count(*) from public.matters), 0::bigint, 'T25 · personnel hors équipe : aucun dossier');
select tests.clear_authentication();

-- T27 / T29 · security.md 2 et 7 : révocation immédiate, définitive, journalisée
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1');
select lives_ok(
  $$ update public.matter_access set revoked_at = now(), revoke_reason = 'fin de mandat'
     where user_id = '00000000-0000-0000-0000-000000000001' $$,
  'Le firm_admin révoque l''accès de John');
select throws_ok(
  $$ update public.matter_access set revoked_at = null where user_id = '00000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'T27 · une révocation ne peut pas être annulée');
select tests.clear_authentication();

-- Même jeton (la session de John n'a pas changé) : coupure immédiate
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*) from public.matters), 0::bigint,
  'T29 · security.md 2 et 7 · session encore valide : plus aucun dossier après révocation');
select is((select count(*) from public.documents) + (select count(*) from public.messages), 0::bigint,
  'T29 · plus aucun document ni message après révocation');
select tests.clear_authentication();

-- Un nouvel octroi crée une nouvelle ligne (historique conservé)
select is((select count(*) from public.matter_access where user_id = '00000000-0000-0000-0000-000000000001'), 1::bigint,
  'L''accès révoqué reste dans l''historique');

select * from finish();
rollback;
