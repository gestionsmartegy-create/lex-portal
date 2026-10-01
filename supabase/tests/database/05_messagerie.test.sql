-- Messagerie : participants, expéditeur non falsifiable, lecture seule, révocation.
-- Scénarios : T14, T15, T20, T21.
begin;
\ir _fixture.psql
select plan(7);

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'Merci Maître') $$,
  'T14 · un client read_write participant peut écrire');
select is((select count(*) from public.messages), 2::bigint, 'T14 · le client voit les messages du fil');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'usurpation') $$,
  '42501', null, 'T15 · impossible d''écrire au nom d''un autre');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('20000000-0000-0000-0000-000000000001', auth.uid(), '   ') $$,
  '23514', null, 'Un message vide est refusé');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok(
  $$ insert into public.conversations (matter_id, scope, created_by) values ('10000000-0000-0000-0000-000000000002', 'matter', auth.uid()) $$,
  '42501', null, 'T20 · un accès read ne peut pas ouvrir de fil');
select is((select count(*) from public.conversations), 0::bigint, 'T21 · Jane ne voit pas le fil de John');
select tests.clear_authentication();

-- Fil fermé : plus d'écriture
update public.conversations set closed_at = now() where id = '20000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'trop tard') $$,
  '42501', null, 'Un fil fermé n''accepte plus de message');
select tests.clear_authentication();

select * from finish();
rollback;
