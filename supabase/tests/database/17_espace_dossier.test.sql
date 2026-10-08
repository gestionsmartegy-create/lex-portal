-- Espace « Dossier » unifié (ADR 0020) : livrables, document lié à une demande.
begin;
\ir _fixture.psql
select plan(21);

-- Équipe du dossier 1 (Wilson, Microsoft) : crée des livrables.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_deliverables (id, matter_id, title, due_date, owner_id, visible_to_client) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Avis juridique', current_date + 7,
   '00000000-0000-0000-0000-00000000000b', true),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Note interne', null, null, false) $$,
  'équipe : ajoute des livrables');
select throws_ok($$ insert into public.matter_deliverables (matter_id, title, owner_id)
  values ('10000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'le responsable doit être un membre du personnel');
select lives_ok($$ update public.matter_deliverables set status = 'delivered' where id = '50000000-0000-0000-0000-000000000001' $$,
  'équipe : marque un livrable remis');
select throws_ok($$ update public.matter_deliverables set matter_id = '10000000-0000-0000-0000-000000000002'
  where id = '50000000-0000-0000-0000-000000000001' $$, '42501', null, 'un livrable ne change pas de dossier');
select tests.clear_authentication();
select ok((select delivered_at is not null from public.matter_deliverables where id = '50000000-0000-0000-0000-000000000001'),
  'date de remise posée par la base');
select is((select created_by from public.matter_deliverables where id = '50000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'auteur posé par la base');

-- Client du dossier : voit seulement les livrables visibles, ne modifie rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_deliverables), 1, 'client : voit seulement le livrable visible');
select throws_ok($$ insert into public.matter_deliverables (matter_id, title) values ('10000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'client : ne crée pas de livrable');
select lives_ok($$ update public.matter_deliverables set title = 'Modifié' $$, 'client : modification sans effet');
select tests.clear_authentication();
select is((select count(*)::int from public.matter_deliverables where title = 'Modifié'), 0, 'client : aucun livrable modifié');

-- Autre client et personnel hors équipe : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.matter_deliverables), 0, 'autre client : aucun livrable');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.matter_deliverables), 0, 'personnel hors équipe : aucun livrable');
select tests.clear_authentication();

-- Document lié à une demande : même dossier exigé, la demande devient « reçue ».
insert into public.document_requests (id, matter_id, requested_from, title)
  values ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001', 'Passeport');
insert into public.documents (id, matter_id, provider, display_name, scan_status, folder)
  values ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'sharepoint', 'Autre dossier.pdf', 'clean', 'shared');
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ update public.document_requests set fulfilled_document_id = '60000000-0000-0000-0000-000000000002'
  where id = '40000000-0000-0000-0000-000000000009' $$, '42501', null, 'un document d''un autre dossier est refusé');
select lives_ok($$ update public.document_requests set fulfilled_document_id =
    (select id from public.documents where matter_id = '10000000-0000-0000-0000-000000000001' limit 1)
  where id = '40000000-0000-0000-0000-000000000009' $$, 'équipe : lie un document du dossier');
select tests.clear_authentication();
select is((select status::text from public.document_requests where id = '40000000-0000-0000-0000-000000000009'), 'fulfilled',
  'la demande liée devient reçue');
select ok((select count(*) from audit.events where action like 'matter_deliverable.%') >= 3, 'audit : livrables journalisés');

-- Revue : document lié à la création ignoré ; document interne refusé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.document_requests (id, matter_id, requested_from, title, fulfilled_document_id)
  values ('40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001', 'Pièce', '60000000-0000-0000-0000-000000000002') $$,
  'création avec un document lié : acceptée mais sans le document');
select throws_ok($$ update public.document_requests set fulfilled_document_id =
    (select id from public.documents where matter_id = '10000000-0000-0000-0000-000000000001' and folder = 'internal' limit 1)
  where id = '40000000-0000-0000-0000-000000000010' $$, '42501', null, 'un document interne ne peut pas être lié');
select tests.clear_authentication();
select is((select fulfilled_document_id from public.document_requests where id = '40000000-0000-0000-0000-000000000010'),
  null, 'aucun document lié à la création');

-- Membre de l'équipe connecté par mot de passe : aucun livrable (ADR 0009).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2', 'password');
select is((select count(*)::int from public.matter_deliverables), 0, 'équipe par mot de passe : aucun livrable');
select tests.clear_authentication();

-- Client dont l'accès est révoqué : plus aucun livrable.
update public.matter_access set revoked_at = now()
 where matter_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_deliverables), 0, 'client révoqué : aucun livrable');
select tests.clear_authentication();

select * from finish();
rollback;
