-- Clio (ADR 0038) : dépôt du contrat validé, dates de cour importées de Clio.
begin;
\ir _fixture.psql
select plan(30);

update public.matters set clio_matter_id = '900100' where id = '10000000-0000-0000-0000-000000000001';

-- Validation d'un contrat du dossier lié à Clio : Clio « à faire », SharePoint « en attente ».
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name, matter_id)
values ('f4000000-0000-0000-0000-0000000000a1', 'Mandat Clio', 'John Doe', '10000000-0000-0000-0000-000000000001');
select public.contract_validate('f4000000-0000-0000-0000-0000000000a1',
  encode(convert_to('%PDF-1.4' || repeat(' x', 80), 'UTF8'), 'base64'));
select is((select string_agg(target || ':' || status, ',' order by target) from public.contract_deposits
            where contract_id = 'f4000000-0000-0000-0000-0000000000a1'),
  'clio:pending,sharepoint:waiting', 'validation : dépôt Clio à faire, SharePoint en attente de Microsoft');
select throws_ok($$ select * from public.contract_deposit_claim(10) $$, '42501', null, 'personnel : ne réserve pas les dépôts');
select throws_ok($$ update public.contract_deposits set status = 'done' $$, '42501', null, 'personnel : n''écrit pas l''état');
select tests.clear_authentication();

-- Contrat sans dossier, validé par le firm_admin : Clio « en attente » (pas de dossier Clio).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name)
values ('f4000000-0000-0000-0000-0000000000a2', 'Sans dossier', 'X');
select public.contract_validate('f4000000-0000-0000-0000-0000000000a2',
  encode(convert_to('%PDF-1.4' || repeat(' y', 80), 'UTF8'), 'base64'));
select is((select status || '/' || last_error from public.contract_deposits
            where contract_id = 'f4000000-0000-0000-0000-0000000000a2' and target = 'clio'),
  'waiting/NO_CLIO_MATTER', 'sans dossier Clio : en attente');
select tests.clear_authentication();

-- Lecture : équipe oui ; hors équipe et client, rien.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.contract_deposits), 0, 'hors équipe : aucun dépôt visible');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.contract_deposits), 0, 'client : aucun dépôt visible');
select tests.clear_authentication();

-- Planificateur (service_role) : réservation avec le PDF, échecs, puis réussite.
set local role service_role;
select is((select count(*)::int from public.contract_deposit_claim(10) where pdf_base64 is not null
            and clio_matter_id = '900100' and file_name like 'Mandat Clio - v1.pdf'), 1,
  'planificateur : dépôt réservé avec le PDF et le dossier Clio');
select is((select count(*)::int from public.contract_deposit_claim(10)), 0, 'déjà réservé : pas de double dépôt');
select public.contract_deposit_result(id, false, null, 'UPSTREAM') from public.contract_deposits
 where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio';
select is((select status from public.contract_deposits where contract_id = 'f4000000-0000-0000-0000-0000000000a1'
            and target = 'clio'), 'pending', 'premier échec : nouvelle tentative plus tard');
update public.contract_deposits set attempts = 5 where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio';
select public.contract_deposit_result(id, false, null, 'bad error text') from public.contract_deposits
 where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio';
select is((select status || '/' || last_error from public.contract_deposits
            where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio'),
  'failed/UPSTREAM', 'cinq échecs : « échec », code d''erreur contrôlé');
reset role;

select set_config('tests.dep', (select id::text from public.contract_deposits
  where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio'), true);
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select throws_ok($$ select public.contract_deposit_retry(current_setting('tests.dep')::uuid) $$, 'P0002', null,
  'hors équipe : ne relance pas');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ select public.contract_deposit_retry(d.id) from public.contract_deposits d
  where d.contract_id = 'f4000000-0000-0000-0000-0000000000a1' and d.target = 'clio' $$, 'équipe : relance un dépôt en échec');
select tests.clear_authentication();

set local role service_role;
select public.contract_deposit_result(c.id, true, '555001', null) from public.contract_deposit_claim(10) c;
select is((select status || '/' || external_id from public.contract_deposits
            where contract_id = 'f4000000-0000-0000-0000-0000000000a1' and target = 'clio'), 'done/555001',
  'dépôt réussi : document Clio enregistré');
reset role;
select ok(exists (select 1 from audit.events where action = 'contract.deposited')
          and exists (select 1 from audit.events where action = 'contract.deposit_failed'), 'dépôts journalisés');

-- Dates de cour venues de Clio.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select set_config('tests.cd', public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777001', 'hearing',
  now() + interval '20 days', null, false, 'America/Halifax')::text, true);
select is((select status || '/' || source || '/' || clio_sync_status || '/' || clio_calendar_entry_id
             from public.court_dates where id = current_setting('tests.cd')::uuid),
  'scheduled/clio/synced/777001', 'import : date à confirmer, déjà liée à Clio (jamais recréée)');
select is(public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777001', 'hearing',
  now() + interval '20 days', null, false, 'America/Halifax'), null, 'déjà importée : rien de plus');
select throws_ok($$ select public.court_date_import_clio('10000000-0000-0000-0000-000000000001', 'abc', 'hearing',
  now(), null, false, 'America/Halifax') $$, '22023', null, 'identifiant Clio invalide refusé');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select throws_ok($$ select public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777002', 'hearing',
  now(), null, false, 'America/Halifax') $$, 'P0002', null, 'hors équipe : pas d''import');
select tests.clear_authentication();

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777003', 'trial',
  now() + interval '30 days', null, false, 'America/Halifax') is not null, 'planificateur : import automatique');
select is((select count(*)::int from public.clio_agenda_next(20) where clio_matter_id = '900100'), 1,
  'planificateur : dossiers liés à Clio à relire');
reset role;

-- Identifiant Clio d'un dossier : équipe seulement (la colonne n'est pas lisible par l'API).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is(public.matter_clio_id('10000000-0000-0000-0000-000000000001'), '900100', 'équipe : identifiant Clio du dossier');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is(public.matter_clio_id('10000000-0000-0000-0000-000000000001'), null, 'hors équipe : rien');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is(public.matter_clio_id('10000000-0000-0000-0000-000000000001'), null, 'client : rien');
select tests.clear_authentication();

-- Fonctions du planificateur : jamais pour authenticated ; import et relance : jamais pour un client,
-- anon ou du personnel connecté par mot de passe (ADR 0009).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.contract_deposit_result(gen_random_uuid(), true, '1', null) $$, '42501', null,
  'personnel : n''écrit pas un résultat de dépôt');
select throws_ok($$ select * from public.clio_agenda_next(5) $$, '42501', null, 'personnel : pas de curseur d''agenda');
select throws_ok($$ select public.clio_agenda_mark(gen_random_uuid(), now()) $$, '42501', null,
  'personnel : ne déplace pas le curseur');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777009', 'hearing',
  now(), null, false, 'America/Halifax') $$, 'P0002', null, 'client : pas d''import');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2');
select throws_ok($$ select public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777010', 'hearing',
  now(), null, false, 'America/Halifax') $$, 'P0002', null, 'personnel sans connexion Microsoft : pas d''import');
select tests.clear_authentication();
set local role anon;
select throws_ok($$ select public.court_date_import_clio('10000000-0000-0000-0000-000000000001', '777011', 'hearing',
  now(), null, false, 'America/Halifax') $$, '42501', null, 'anon : pas d''import');
reset role;
select ok(exists (select 1 from audit.events where action = 'contract.deposit_retried'), 'relance journalisée');

select * from finish();
rollback;
