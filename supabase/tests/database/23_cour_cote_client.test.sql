-- Dates de cour côté client (ADR 0028) : seulement les dates rendues visibles, colonnes limitées.
begin;
\ir _fixture.psql
select plan(13);

insert into public.court_dates (id, matter_id, kind, starts_at, timezone, notes, judge, docket_number,
                                client_instructions, visible_to_client, mode, virtual_link)
values
  ('c0000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'hearing',
   now() + interval '5 days', 'America/Halifax', 'Note interne secrète', 'Juge X', 'GR-1',
   'Apportez votre pièce d''identité.', true, 'virtual', 'https://meet.example.com/a'),
  ('c0000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000001', 'motion',
   now() + interval '6 days', 'America/Halifax', null, null, null, null, false, 'in_person', null),
  ('c0000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001', 'trial',
   now() - interval '10 days', 'America/Halifax', null, null, null, null, true, 'in_person', null);

-- Client du dossier (MFA) : la seule date visible et à venir.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.client_court_dates()), 1, 'client : seulement la date visible et à venir');
select is((select client_instructions from public.client_court_dates() limit 1), 'Apportez votre pièce d''identité.',
  'client : voit les consignes');
select is((select virtual_link from public.client_court_dates() limit 1), 'https://meet.example.com/a',
  'client : voit le lien d''une audience virtuelle rendue visible');
select is((select count(*)::int from public.court_dates), 0, 'client : aucune lecture directe (notes, juge, greffe)');
select is((select count(*)::int from public.client_court_dates('10000000-0000-0000-0000-000000000002')), 0,
  'client : rien sur un dossier qui n''est pas le sien');
select tests.clear_authentication();

-- Date annulée : n'apparaît plus.
update public.court_dates set status = 'cancelled', cancel_reason = 'Règlement' where id = 'c0000000-0000-0000-0000-0000000000c1';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.client_court_dates()), 0, 'client : date annulée retirée');
select tests.clear_authentication();
update public.court_dates set status = 'scheduled' where id = 'c0000000-0000-0000-0000-0000000000c2';
update public.court_dates set visible_to_client = true where id = 'c0000000-0000-0000-0000-0000000000c2';

-- Client sans MFA, autre client, personnel : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*)::int from public.client_court_dates()), 0, 'client sans MFA : rien');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.client_court_dates()), 0, 'autre client : rien');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*)::int from public.client_court_dates()), 0, 'personnel : pas par cette fonction');
select tests.clear_authentication();

-- Rappels : table privée, inaccessible aux utilisateurs.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select * from private.court_date_reminders $$, '42501', null, 'rappels : table privée');
select tests.clear_authentication();

-- Réservation d'un rappel : réservée au serveur, une seule fois.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.claim_court_date_reminder('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '7d') $$,
  '42501', null, 'client : ne réserve pas de rappel');
select tests.clear_authentication();
set local role service_role;
select is(public.claim_court_date_reminder('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '7d')::text
       || public.claim_court_date_reminder('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '7d')::text,
  'truefalse', 'serveur : un seul rappel par date, client et sorte');
reset role;

-- Accès retiré : plus aucune date pour ce client.
update public.matter_access set revoked_at = now(), revoked_by = '00000000-0000-0000-0000-00000000000a', revoke_reason = 'Test'
 where matter_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.client_court_dates()), 0, 'client dont l''accès est retiré : rien');
select tests.clear_authentication();

select * from finish();
rollback;
