-- Contrats, lot 3 (ADR 0036) : validation par un avocat, PDF officiel et empreinte, envoi de la
-- version validée, relance, refus, nouvelle version, commentaires de relecture.
begin;
\ir _fixture.psql
select plan(43);

-- …0c devient adjoint·e du dossier 1 (prépare, ne valide pas) ; …0b en est l'avocat responsable.
insert into public.matter_team (matter_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'assistant');

-- L'adjoint·e crée et rédige ; la validation lui est refusée.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name, client_id, matter_id)
values ('f2000000-0000-0000-0000-0000000000d1', 'Mandat', 'John Doe',
        '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
insert into public.contract_sections (id, contract_id, position, title, body)
values ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000d1', 0, 'Objet',
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Texte."}]}]}');
select throws_ok($$ select public.contract_validate('f2000000-0000-0000-0000-0000000000d1',
  encode(convert_to('%PDF-1.4' || repeat(' x', 80), 'UTF8'), 'base64')) $$, '42501', null,
  'adjoint·e : ne valide pas');
select throws_ok($$ select public.contract_send('f2000000-0000-0000-0000-0000000000d1', 'portal') $$, '23514', null,
  'pas d''envoi sans validation');
select lives_ok($$ insert into public.contract_comments (contract_id, section_id, body)
  values ('f2000000-0000-0000-0000-0000000000d1', 'f2000000-0000-0000-0000-0000000000e1', 'Préciser l''objet.') $$,
  'équipe : commentaire de relecture sur une section');
select public.contract_release_lock('f2000000-0000-0000-0000-0000000000d1');
select tests.clear_authentication();

-- L'avocat : verrou requis, PDF contrôlé, empreinte calculée par la base.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.contract_validate('f2000000-0000-0000-0000-0000000000d1',
  encode(convert_to('%PDF-1.4' || repeat(' x', 80), 'UTF8'), 'base64')) $$, '42501', null, 'validation sans verrou refusée');
select public.contract_acquire_lock('f2000000-0000-0000-0000-0000000000d1');
select throws_ok($$ select public.contract_validate('f2000000-0000-0000-0000-0000000000d1',
  encode(convert_to('<html>' || repeat(' x', 80), 'UTF8'), 'base64')) $$, '22023', null, 'un fichier qui n''est pas un PDF est refusé');
select is(public.contract_validate('f2000000-0000-0000-0000-0000000000d1',
            encode(convert_to('%PDF-1.4' || repeat(' x', 80), 'UTF8'), 'base64')),
          encode(extensions.digest(convert_to('%PDF-1.4' || repeat(' x', 80), 'UTF8'), 'sha256'), 'hex'),
          'empreinte SHA-256 calculée par la base');
select is((select status || '/' || validated_version::text || '/' || (locked_by is null)::text from public.contracts
            where id = 'f2000000-0000-0000-0000-0000000000d1'), 'validated/1/true', 'validé : version 1, verrou libéré');
select throws_ok($$ update public.contracts set title = 'Changé' where id = 'f2000000-0000-0000-0000-0000000000d1' $$,
  '23514', null, 'validé : plus modifiable');
select throws_ok($$ update public.contracts set pdf_sha256 = repeat('0', 64) where id = 'f2000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'l''empreinte ne s''écrit pas à la main');
select is((select count(*)::int from public.contract_pdf('f2000000-0000-0000-0000-0000000000d1')), 1,
  'équipe : PDF officiel disponible');
select lives_ok($$ select public.contract_reopen('f2000000-0000-0000-0000-0000000000d1') $$, 'retour au brouillon avant l''envoi');
select is((select status from public.contracts where id = 'f2000000-0000-0000-0000-0000000000d1'), 'draft', 'de nouveau en brouillon');
select is(public.contract_validate('f2000000-0000-0000-0000-0000000000d1',
            encode(convert_to('%PDF-1.4' || repeat(' y', 80), 'UTF8'), 'base64')) is not null, true, 'nouvelle validation');
select is(public.contract_send('f2000000-0000-0000-0000-0000000000d1', 'portal'), 2, 'envoi de la version validée (2)');
select throws_ok($$ select public.contract_remind('f2000000-0000-0000-0000-0000000000d1') $$, '55000', null,
  'relance : pas le jour même de l''envoi');
select tests.clear_authentication();

-- Relance possible après un jour.
select set_config('lex.contract_flow', 'on', true);
update public.contracts set sent_at = now() - interval '2 days' where id = 'f2000000-0000-0000-0000-0000000000d1';
select set_config('lex.contract_flow', 'off', true);
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select lives_ok($$ select public.contract_remind('f2000000-0000-0000-0000-0000000000d1') $$, 'relance après un jour (adjoint·e compris)');
select throws_ok($$ select public.contract_remind('f2000000-0000-0000-0000-0000000000d1') $$, '55000', null,
  'une seule relance par jour');
select tests.clear_authentication();

-- Autre client : ni PDF, ni refus, ni commentaires.
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.contract_pdf('f2000000-0000-0000-0000-0000000000d1')), 0, 'autre client : aucun PDF');
select throws_ok($$ select public.client_contract_decline('f2000000-0000-0000-0000-0000000000d1', 'Non') $$, 'P0002', null,
  'autre client : refus introuvable');
select is((select count(*)::int from public.contract_comments), 0, 'client : aucun commentaire de relecture');
select tests.clear_authentication();

-- Le client : PDF de la version envoyée, refus avec motif.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select version from public.contract_pdf('f2000000-0000-0000-0000-0000000000d1')), 2, 'client : PDF de la version envoyée');
select lives_ok($$ select public.client_contract_decline('f2000000-0000-0000-0000-0000000000d1', 'Tarif trop élevé') $$,
  'client : refuse le contrat');
select is((select status from public.client_contracts() where id = 'f2000000-0000-0000-0000-0000000000d1'), 'declined',
  'client : voit « Refusé »');
select throws_ok($$ select public.client_contract_accept('f2000000-0000-0000-0000-0000000000d1', 'John Doe') $$, '23514', null,
  'refusé : plus acceptable');
select tests.clear_authentication();

-- Nouvelle version après le refus : brouillon qui reprend tout ; l'ancien est remplacé et quitte le portail.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select set_config('tests.v2', public.contract_new_version('f2000000-0000-0000-0000-0000000000d1')::text, true);
select is((select status || '/' || (previous_id = 'f2000000-0000-0000-0000-0000000000d1')::text
             from public.contracts where id = current_setting('tests.v2')::uuid), 'draft/true', 'nouvelle version : brouillon lié');
select is((select count(*)::int from public.contract_sections where contract_id = current_setting('tests.v2')::uuid), 1,
  'nouvelle version : sections reprises');
select is((select status from public.contracts where id = 'f2000000-0000-0000-0000-0000000000d1'), 'superseded',
  'ancienne version : remplacée');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.client_contracts() where id = 'f2000000-0000-0000-0000-0000000000d1'), 0,
  'client : un contrat remplacé disparaît du portail');
select tests.clear_authentication();

-- Client invité après la rédaction : l'envoi retrouve son compte d'après le courriel de la fiche.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name, client_email)
values ('f2000000-0000-0000-0000-0000000000d2', 'Sans dossier', 'John Doe', 'JOHN@example.com');
select throws_ok($$ select public.contract_validate('f2000000-0000-0000-0000-0000000000d2',
  encode(convert_to('%PDF-1.4' || repeat(' z', 80), 'UTF8'), 'base64')) $$, '42501', null,
  'sans dossier : l''auteur ne valide pas (firm_admin seulement)');
select public.contract_release_lock('f2000000-0000-0000-0000-0000000000d2');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select public.contract_acquire_lock('f2000000-0000-0000-0000-0000000000d2');
select lives_ok($$ select public.contract_validate('f2000000-0000-0000-0000-0000000000d2',
  encode(convert_to('%PDF-1.4' || repeat(' z', 80), 'UTF8'), 'base64')) $$, 'sans dossier : validé par le firm_admin');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select email from public.contract_client_account('f2000000-0000-0000-0000-0000000000d2')),
  'john@example.com', 'aperçu avant l''envoi : compte retrouvé par le courriel');
select lives_ok($$ select public.contract_send('f2000000-0000-0000-0000-0000000000d2', 'portal') $$,
  'envoi : compte du client retrouvé par son courriel');
select is((select client_id from public.contracts where id = 'f2000000-0000-0000-0000-0000000000d2'),
  '00000000-0000-0000-0000-000000000001'::uuid, 'contrat lié au compte du client');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ select public.client_contract_accept('f2000000-0000-0000-0000-0000000000d2', 'John Doe') $$,
  'client : accepte le contrat sans dossier');
select tests.clear_authentication();

select ok(exists (select 1 from audit.events where action = 'contract.client_linked'
                 and resource_id = 'f2000000-0000-0000-0000-0000000000d2'), 'liaison du compte journalisée');

-- Rattacher le contrat accepté à un dossier : firm_admin seulement.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.contract_link_matter('f2000000-0000-0000-0000-0000000000d2',
  '10000000-0000-0000-0000-000000000001') $$, '42501', null, 'personnel : ne rattache pas un dossier');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select throws_ok($$ select public.contract_link_matter('f2000000-0000-0000-0000-0000000000d2',
  '10000000-0000-0000-0000-000000000002') $$, '23514', null, 'pas de dossier auquel le client n''a pas accès');
select lives_ok($$ select public.contract_link_matter('f2000000-0000-0000-0000-0000000000d2',
  '10000000-0000-0000-0000-000000000001') $$, 'firm_admin : rattache le contrat accepté au dossier');
select is((select matter_id from public.contracts where id = 'f2000000-0000-0000-0000-0000000000d2'),
  '10000000-0000-0000-0000-000000000001'::uuid, 'contrat rattaché au dossier');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
update public.contract_comments set resolved_at = now() where contract_id = 'f2000000-0000-0000-0000-0000000000d1';
update public.contract_comments set resolved_at = '2000-01-01' where contract_id = 'f2000000-0000-0000-0000-0000000000d1';
select ok((select resolved_at > '2020-01-01' from public.contract_comments
            where contract_id = 'f2000000-0000-0000-0000-0000000000d1'), 'la date de résolution ne se réécrit pas');
select tests.clear_authentication();

delete from public.matter_team
 where matter_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000c';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.contract_pdf('f2000000-0000-0000-0000-0000000000d1')), 0,
  'hors équipe : aucun PDF');
select is((select count(*)::int from public.contract_comments), 0, 'hors équipe : aucun commentaire');
select tests.clear_authentication();

select ok(exists (select 1 from audit.events where action = 'contract.pdf_downloaded')
          and exists (select 1 from audit.events where action = 'contract.reminded')
          and exists (select 1 from audit.events where action = 'contract.new_version')
          and not exists (select 1 from audit.events where metadata::text like '%Tarif trop%'),
  'PDF, relance et nouvelle version journalisés ; jamais le motif du refus');

select * from finish();
rollback;
