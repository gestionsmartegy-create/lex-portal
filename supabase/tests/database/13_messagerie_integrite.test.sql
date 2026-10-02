-- Revue J4/J5 : un message ne peut pas être antidaté par l'API (ADR 0014, addendum).
begin;
\ir _fixture.psql
select plan(5);

select ok(not has_column_privilege('authenticated', 'public.messages', 'created_at', 'INSERT'), 'created_at d''un message non insérable par l''API');
select ok(has_column_privilege('authenticated', 'public.messages', 'body', 'INSERT'), 'le corps du message reste insérable');
select ok(not has_column_privilege('authenticated', 'public.conversations', 'closed_at', 'INSERT'), 'un fil ne peut pas être créé clos');

-- Client read_write participant (fixture) : la date est imposée par la base.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
insert into public.messages (conversation_id, sender_id, body)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'test intégrité');
select tests.clear_authentication();
select ok((select created_at > now() - interval '1 minute' from public.messages where body = 'test intégrité'), 'date du message imposée par le serveur');

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, body, created_at)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'antidaté', '2025-01-01') $$,
  '42501', null, 'antidater un message est refusé');
select tests.clear_authentication();

select * from finish();
rollback;
