-- Contrats dans le portail client (ADR 0035) : envoi, lecture de la version figée, acceptation.
begin;
\ir _fixture.psql
select plan(32);

-- …0b rejoint aussi l'équipe du dossier 2, auquel le client …0001 n'a PAS accès.
insert into public.matter_team (matter_id, user_id, role)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'responsible');

-- Personnel de l'équipe (…0b) : deux contrats pour le client …0001, un sans compte client.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name, client_id, matter_id, client_province)
values ('f1000000-0000-0000-0000-0000000000c1', 'Conditions de service', 'John Doe',
        '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'NB'),
       ('f1000000-0000-0000-0000-0000000000c2', 'Sans compte', 'Riley Démo', null, null, null),
       ('f1000000-0000-0000-0000-0000000000c3', 'Convention Clio', 'John Doe',
        '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null),
       ('f1000000-0000-0000-0000-0000000000c4', 'Brouillon', 'John Doe',
        '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null),
       ('f1000000-0000-0000-0000-0000000000c5', 'Autre dossier', 'John Doe',
        '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', null);
insert into public.contract_sections (contract_id, position, title, body)
values ('f1000000-0000-0000-0000-0000000000c1', 0, 'Parties',
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Texte envoyé."}]}]}');
insert into public.contract_line_items (contract_id, position, description, quantity, unit_price)
values ('f1000000-0000-0000-0000-0000000000c1', 0, 'Consultation', 1, 200.00);

-- Lot 3 (ADR 0036) : seul un contrat VALIDÉ s'envoie ; on valide c1, c3 et c5 (…0b est avocat responsable).
select public.contract_validate('f1000000-0000-0000-0000-0000000000c1', encode(convert_to('%PDF-1.4' || repeat(' contenu', 30), 'UTF8'), 'base64'));
select public.contract_validate('f1000000-0000-0000-0000-0000000000c3', encode(convert_to('%PDF-1.4' || repeat(' contenu', 30), 'UTF8'), 'base64'));
select public.contract_validate('f1000000-0000-0000-0000-0000000000c5', encode(convert_to('%PDF-1.4' || repeat(' contenu', 30), 'UTF8'), 'base64'));
select throws_ok($$ select public.contract_send('f1000000-0000-0000-0000-0000000000c2', 'portal') $$,
  '23514', null, 'envoi refusé sans compte client');
select throws_ok($$ select public.contract_send('f1000000-0000-0000-0000-0000000000c1', 'email') $$,
  '22023', null, 'mode de signature inconnu refusé');
select throws_ok($$ update public.contracts set accepted_at = now() where id = 'f1000000-0000-0000-0000-0000000000c2' $$,
  '42501', null, 'personnel : n''écrit pas l''acceptation');
select is(public.contract_send('f1000000-0000-0000-0000-0000000000c1', 'portal'), 1, 'envoi : version 1 figée');
select is((select status || '/' || signing_mode || '/' || (locked_by is null)::text from public.contracts
            where id = 'f1000000-0000-0000-0000-0000000000c1'), 'sent/portal/true', 'envoyé, mode portail, verrou libéré');
select lives_ok($$ select public.contract_send('f1000000-0000-0000-0000-0000000000c3', 'clio') $$, 'envoi en mode Clio');
select throws_ok($$ update public.contracts set title = 'Modifié' where id = 'f1000000-0000-0000-0000-0000000000c1' $$,
  '23514', null, 'après l''envoi : plus de modification');
select throws_ok($$ insert into public.contract_sections (contract_id, position, title, body)
  values ('f1000000-0000-0000-0000-0000000000c1', 1, 'Ajout', '{"type":"doc","content":[]}') $$,
  '42501', null, 'après l''envoi : plus de section');
select throws_ok($$ insert into public.contract_line_items (contract_id, position, description, quantity, unit_price)
  values ('f1000000-0000-0000-0000-0000000000c1', 1, 'Ajout', 1, 10) $$,
  '42501', null, 'après l''envoi : plus de ligne de service');
select throws_ok($$ select public.contract_send('f1000000-0000-0000-0000-0000000000c5', 'portal') $$,
  '23514', null, 'envoi refusé : le client n''a pas accès au dossier');
select tests.clear_authentication();

-- Personnel hors équipe : n'envoie pas.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select throws_ok($$ select public.contract_send('f1000000-0000-0000-0000-0000000000c2', 'portal') $$,
  'P0002', null, 'hors équipe : pas d''envoi (même réponse que « introuvable »)');
select tests.clear_authentication();

-- Autre client (…0002) : rien, même réponse que « n'existe pas ».
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.client_contracts()), 0, 'autre client : aucun contrat');
select is(public.client_contract('f1000000-0000-0000-0000-0000000000c1'), null, 'autre client : contrat introuvable');
select throws_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c1', 'Jane Roe') $$,
  'P0002', null, 'autre client : acceptation introuvable');
select public.client_contract_viewed('f1000000-0000-0000-0000-0000000000c1');
select tests.clear_authentication();

-- Le client sans double vérification (aal1) : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*)::int from public.client_contracts()), 0, 'client sans MFA : aucun contrat');
select tests.clear_authentication();

-- Le client destinataire.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.contracts), 0, 'client : aucun accès direct à la table des contrats');
select is((select count(*)::int from public.client_contracts()), 2, 'client : ses 2 contrats envoyés, jamais le brouillon');
select is(public.client_contract('f1000000-0000-0000-0000-0000000000c4'), null, 'client : brouillon introuvable');
select throws_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c4', 'John Doe') $$,
  'P0002', null, 'client : brouillon non acceptable');
select ok((select viewed_at is null from public.client_contracts() where id = 'f1000000-0000-0000-0000-0000000000c1'),
  'la consultation d''un autre client ne compte pas');
select ok(not (public.client_contract('f1000000-0000-0000-0000-0000000000c1') -> 'snapshot' -> 'sections' -> 0 ? 'ai_assisted'),
  'client : aucune colonne interne dans la version');
select is(jsonb_array_length(public.client_contract('f1000000-0000-0000-0000-0000000000c1') -> 'snapshot' -> 'sections'), 1,
  'client : la version figée');
select is((select (r ->> 'rate') from jsonb_array_elements(public.client_contract('f1000000-0000-0000-0000-0000000000c1') -> 'rates') r),
  '15.000', 'client : taux de la province du contrat');
select public.client_contract_viewed('f1000000-0000-0000-0000-0000000000c1');
select ok((select viewed_at is not null from public.client_contracts() where id = 'f1000000-0000-0000-0000-0000000000c1'),
  'consultation enregistrée');
select throws_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c3', 'John Doe') $$,
  '23514', null, 'mode Clio : pas d''acceptation dans le portail');
select throws_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c1', ' J ') $$,
  '22023', null, 'nom trop court refusé');
select lives_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c1', 'John Doe') $$,
  'client : accepte le contrat');
select is((select status from public.client_contracts() where id = 'f1000000-0000-0000-0000-0000000000c1'), 'signed',
  'contrat accepté');
select throws_ok($$ select public.client_contract_accept('f1000000-0000-0000-0000-0000000000c1', 'John Doe') $$,
  '23514', null, 'pas de deuxième acceptation');
select tests.clear_authentication();

-- Accès au dossier retiré : le contrat disparaît du portail.
update public.matter_access set revoked_at = now()
 where matter_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.client_contracts()), 0, 'accès retiré : plus aucun contrat du dossier');
select tests.clear_authentication();

select ok(not exists (select 1 from audit.events where action = 'contract.accepted' and metadata::text like '%John Doe%'),
  'le nom tapé n''est pas journalisé');
select ok(exists (select 1 from audit.events where action = 'contract.accepted')
          and exists (select 1 from audit.events where action = 'contract.sent')
          and exists (select 1 from audit.events where action = 'contract.viewed'),
  'envoi, consultation et acceptation journalisés');

select * from finish();
rollback;
