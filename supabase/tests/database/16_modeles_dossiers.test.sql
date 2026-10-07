-- Modèles de dossiers (ADR 0019) : types, champs par dossier, demandes de documents.
begin;
\ir _fixture.psql
select plan(33);

-- Les modèles viennent de la migration de contenu.
select ok((select count(*) from public.matter_types) >= 20, 'modèles : types de dossier présents');

-- Client : ne voit pas les modèles du cabinet.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_types), 0, 'client : aucun type de dossier visible');
select is((select count(*)::int from public.matter_type_steps), 0, 'client : aucune étape type visible');
select tests.clear_authentication();

-- Personnel de l'équipe (Microsoft) : lit les modèles, ne les modifie pas.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select ok((select count(*) from public.matter_types) >= 20, 'personnel : lit les types de dossier');
select throws_ok($$ insert into public.matter_types (code, practice_group, name_fr, name_en) values ('intrus', 'legal', 'X', 'X') $$,
  '42501', null, 'personnel : ne crée pas de type');
-- Il choisit le type du dossier et remplit les champs.
select lives_ok($$ update public.matters set matter_type_id = (select id from public.matter_types where code = 'immigration_pr')
  where id = '10000000-0000-0000-0000-000000000001' $$, 'équipe : choisit le type du dossier');
select lives_ok($$ insert into public.matter_field_values (matter_id, field_id, value)
  select '10000000-0000-0000-0000-000000000001', f.id, 'UCI-1234'
    from public.matter_type_fields f join public.matter_types t on t.id = f.matter_type_id
   where t.code = 'immigration_pr' and f.position = 1 $$, 'équipe : remplit un champ visible');
select lives_ok($$ insert into public.matter_field_values (matter_id, field_id, value)
  select '10000000-0000-0000-0000-000000000001', f.id, 'interne'
    from public.matter_type_fields f join public.matter_types t on t.id = f.matter_type_id
   where t.code = 'immigration_pr' and f.position = 2 $$, 'équipe : remplit un deuxième champ');
select throws_ok($$ insert into public.matter_field_values (matter_id, field_id, value)
  select '10000000-0000-0000-0000-000000000001', f.id, 'x'
    from public.matter_type_fields f join public.matter_types t on t.id = f.matter_type_id
   where t.code = 'real_estate' limit 1 $$, '42501', null, 'un champ d''un autre type est refusé');
select tests.clear_authentication();

-- Le deuxième champ devient interne (firm_admin) : le client ne doit plus le voir.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ update public.matter_type_fields set visible_to_client = false
  where position = 2 and matter_type_id = (select id from public.matter_types where code = 'immigration_pr') $$,
  'firm_admin : rend un champ interne');
select lives_ok($$ insert into public.matter_types (code, practice_group, name_fr, name_en) values ('test_type', 'legal', 'Essai', 'Test') $$,
  'firm_admin : crée un type');
select tests.clear_authentication();

-- Client du dossier : voit le champ visible, jamais le champ interne.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_field_values where matter_id = '10000000-0000-0000-0000-000000000001'), 1,
  'client : voit seulement la valeur du champ visible');
select is((select value from public.matter_field_values where matter_id = '10000000-0000-0000-0000-000000000001'), 'UCI-1234',
  'client : la valeur visible est la bonne');
select ok((select count(*) from public.matter_type_fields where visible_to_client) >= 1, 'client : lit le libellé des champs visibles de son dossier');
select is((select count(*)::int from public.matter_type_fields where not visible_to_client), 0, 'client : aucun libellé de champ interne');
select throws_ok($$ insert into public.matter_field_values (matter_id, field_id, value)
  select '10000000-0000-0000-0000-000000000001', f.id, 'x' from public.matter_type_fields f limit 1 $$,
  '42501', null, 'client : ne remplit aucun champ');
select throws_ok($$ insert into public.document_requests (matter_id, requested_from, title)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'client : ne crée pas de demande');
select tests.clear_authentication();

-- Demandes de documents par l'avocat de l'équipe.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.document_requests (id, matter_id, requested_from, title, title_en, due_date)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001', 'Passeport', 'Passport', current_date + 10) $$,
  'équipe : demande un document au client du dossier');
select throws_ok($$ insert into public.document_requests (matter_id, requested_from, title)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'x') $$,
  '42501', null, 'équipe : jamais à un client sans accès au dossier');
select tests.clear_authentication();
select is((select requested_by from public.document_requests where id = '40000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'auteur de la demande imposé par la base');

-- Le client voit sa demande mais ne la modifie pas ; Jane ne la voit pas.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ update public.document_requests set status = 'fulfilled' where id = '40000000-0000-0000-0000-000000000001' $$,
  'client : modification sans effet');
select tests.clear_authentication();
select is((select status::text from public.document_requests where id = '40000000-0000-0000-0000-000000000001'), 'pending',
  'client : la demande reste en attente');

-- L'équipe la marque reçue : date posée par la base, changement journalisé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ update public.document_requests set status = 'fulfilled' where id = '40000000-0000-0000-0000-000000000001' $$,
  'équipe : marque la demande reçue');
select tests.clear_authentication();
select ok((select count(*) from audit.events where action in ('document_request.created', 'document_request.fulfilled')
  and resource_id = '40000000-0000-0000-0000-000000000001') = 2, 'audit : création et réception journalisées');

-- Revue de sécurité : renforcements (migration 20261007130200).
-- Auteur et destinataire d'une demande figés à la modification.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ update public.document_requests set requested_from = '00000000-0000-0000-0000-000000000002'
  where id = '40000000-0000-0000-0000-000000000001' $$, '42501', null, 'une demande ne change pas de destinataire');
select lives_ok($$ update public.document_requests set requested_by = '00000000-0000-0000-0000-00000000000a'
  where id = '40000000-0000-0000-0000-000000000001' $$, 'tentative de changer l''auteur');
select tests.clear_authentication();
select is((select requested_by from public.document_requests where id = '40000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'l''auteur de la demande reste inchangé');

-- Personnel hors équipe : n'écrit aucune valeur.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select throws_ok($$ insert into public.matter_field_values (matter_id, field_id, value)
  select '10000000-0000-0000-0000-000000000001', f.id, 'x'
    from public.matter_type_fields f join public.matter_types t on t.id = f.matter_type_id
   where t.code = 'immigration_pr' and f.position = 3 $$, '42501', null, 'personnel hors équipe : n''écrit aucune valeur');
select is((select count(*)::int from public.matter_field_values), 0, 'personnel hors équipe : ne lit aucune valeur');
select tests.clear_authentication();

-- Libellés visibles d'un type utilisé seulement par le dossier d'un autre client : invisibles.
update public.matters set matter_type_id = (select id from public.matter_types where code = 'real_estate')
 where id = '10000000-0000-0000-0000-000000000002';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_type_fields f join public.matter_types t on t.id = f.matter_type_id
            where t.code = 'real_estate'), 0, 'client : aucun libellé d''un type qui n''est pas celui de ses dossiers');
select tests.clear_authentication();

-- Genre d'un champ déjà rempli : figé. Visibilité : journalisée.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select throws_ok($$ update public.matter_type_fields set kind = 'date'
  where position = 1 and matter_type_id = (select id from public.matter_types where code = 'immigration_pr') $$,
  '42501', null, 'un champ déjà rempli ne change pas de genre');
select lives_ok($$ update public.matter_type_fields set visible_to_client = false
  where position = 1 and matter_type_id = (select id from public.matter_types where code = 'immigration_pr') $$,
  'firm_admin : rend un champ interne');
select tests.clear_authentication();
select ok((select count(*) from audit.events where action = 'matter_template.field_visibility') >= 2,
  'audit : chaque changement de visibilité d''un champ est journalisé');

select * from finish();
rollback;
