-- J7 : messagerie du cabinet — droits effectifs et rejoindre un fil (ADR 0017).
begin;
\ir _fixture.psql
select plan(13);

-- Un fil ouvert PAR LE CLIENT : seul John y participe au départ.
insert into public.conversations (id, matter_id, scope, subject, created_by) values
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'matter', 'Question du client',
   '00000000-0000-0000-0000-000000000001');
insert into public.messages (conversation_id, sender_id, body) values
  ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Bonjour le cabinet');

-- Droits
select ok(not has_function_privilege('anon', 'public.matter_permissions(uuid)', 'EXECUTE'), 'anon : pas de droits à consulter');
select ok(not has_function_privilege('anon', 'public.join_conversation(uuid)', 'EXECUTE'), 'anon : ne peut rejoindre aucun fil');

-- matter_permissions : mêmes règles que la RLS
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select row(can_read, can_write)::text from public.matter_permissions('10000000-0000-0000-0000-000000000001')), '(t,t)', 'client read_write : lecture et écriture');
select is((select row(can_read, can_write)::text from public.matter_permissions('10000000-0000-0000-0000-000000000002')), '(f,f)', 'client : rien sur le dossier d''autrui');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select row(can_read, can_write)::text from public.matter_permissions('10000000-0000-0000-0000-000000000002')), '(t,f)', 'client read : lecture seule');
select is(public.join_conversation('20000000-0000-0000-0000-000000000009'), false, 'un client ne peut pas rejoindre un fil');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select row(can_read, can_write)::text from public.matter_permissions('10000000-0000-0000-0000-000000000001')), '(t,t)', 'équipe du dossier : lecture et écriture');
select is((select count(*)::int from public.messages where conversation_id = '20000000-0000-0000-0000-000000000009'), 0, 'avant de rejoindre : messages illisibles');
select is(public.join_conversation('20000000-0000-0000-0000-000000000009'), true, 'membre de l''équipe : rejoint le fil');
select is((select count(*)::int from public.messages where conversation_id = '20000000-0000-0000-0000-000000000009'), 1, 'après avoir rejoint : messages lisibles');
select lives_ok($$ insert into public.messages (conversation_id, sender_id, body)
  values ('20000000-0000-0000-0000-000000000009', auth.uid(), 'Réponse du cabinet') $$, 'membre de l''équipe : peut répondre');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is(public.join_conversation('20000000-0000-0000-0000-000000000009'), false, 'personnel hors équipe : ne peut pas rejoindre');
select is((select count(*)::int from public.conversation_participants where user_id = auth.uid()), 0, 'personnel hors équipe : aucun participant créé');
select tests.clear_authentication();

select * from finish();
rollback;
