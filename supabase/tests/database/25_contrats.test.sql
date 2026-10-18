-- Contrats, lot 1 (ADR 0032) : visibilité, création, verrou d'édition, versions, garde-fous.
begin;
\ir _fixture.psql
select plan(30);

select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.contracts'::regclass, 'public.contract_sections'::regclass, 'public.contract_versions'::regclass)),
  'RLS active sur les trois tables');

-- Wilson (…0b, équipe du dossier 1) : un contrat lié au dossier, un autre sans dossier.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.contracts (id, title, matter_id, client_name, client_email)
  values ('f0000000-0000-0000-0000-0000000000f1', 'Convention de mandat', '10000000-0000-0000-0000-000000000001',
          'Client Démo', 'client.demo@example.com') $$, 'équipe : contrat lié à son dossier');
select lives_ok($$ insert into public.contracts (id, title, client_name)
  values ('f0000000-0000-0000-0000-0000000000f2', 'Convention d''honoraires', 'Nouveau Client') $$,
  'personnel : contrat sans dossier (nouveau client)');
select is((select created_by::text || '/' || status || '/' || (locked_by = auth.uid())::text
             from public.contracts where id = 'f0000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-00000000000b/draft/true', 'auteur imposé, brouillon, verrou à l''auteur');
select throws_ok($$ insert into public.contracts (title, client_name, created_by)
  values ('X', 'Y', '00000000-0000-0000-0000-00000000000a') $$, '42501', null, 'l''auteur ne se choisit pas');
select throws_ok($$ insert into public.contracts (title, client_name, client_email) values ('X', 'Y', 'pas-un-courriel') $$,
  '23514', null, 'courriel invalide refusé');
select throws_ok($$ insert into public.contracts (title, client_name, client_id)
  values ('X', 'Y', '00000000-0000-0000-0000-00000000000c') $$, '23514', null, 'un membre du personnel n''est pas un client');
select lives_ok($$ insert into public.contract_sections (contract_id, position, title, body)
  values ('f0000000-0000-0000-0000-0000000000f1', 0, 'Parties', '{"type": "doc", "content": []}') $$,
  'auteur avec le verrou : ajoute une section');
select throws_ok($$ update public.contracts set locked_by = null where id = 'f0000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'le verrou ne s''écrit pas directement');
select throws_ok($$ delete from public.contracts where id = 'f0000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'aucune suppression d''un contrat');
select throws_ok($$ update public.contracts set status = 'validated' where id = 'f0000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'validation : réservée au lot 3');
select throws_ok($$ update public.contracts set status = 'cancelled' where id = 'f0000000-0000-0000-0000-0000000000f2' $$,
  '23514', null, 'annulation sans motif refusée');
select tests.clear_authentication();

-- Autre membre du personnel (hors équipe), client, anon : rien.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.contracts), 0, 'hors équipe : aucun contrat visible');
select is((select count(*)::int from public.contract_sections), 0, 'hors équipe : aucune section visible');
select throws_ok($$ insert into public.contracts (title, client_name, matter_id)
  values ('X', 'Y', '10000000-0000-0000-0000-000000000001') $$, '42501', null, 'hors équipe : pas de contrat sur ce dossier');
select throws_ok($$ select * from public.contract_acquire_lock('f0000000-0000-0000-0000-0000000000f1') $$,
  'P0002', null, 'hors équipe : même réponse « introuvable »');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.contracts), 0, 'client : aucun contrat au lot 1');
select is(public.contract_client_email_known('john@example.com'), false, 'client : pas de recherche de courriel');
select tests.clear_authentication();

-- Admin : voit tout ; le verrou est tenu par Wilson.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select is((select count(*)::int from public.contracts), 2, 'admin : tous les contrats');
select is((select acquired from public.contract_acquire_lock('f0000000-0000-0000-0000-0000000000f1')), false,
  'verrou : déjà tenu par l''auteur');
update public.contract_sections set title = 'Modifié' where contract_id = 'f0000000-0000-0000-0000-0000000000f1';
select is((select title from public.contract_sections where contract_id = 'f0000000-0000-0000-0000-0000000000f1'),
  'Parties', 'sans le verrou : aucune section modifiée');
select is(public.contract_client_email_known('JOHN@example.com'), true, 'personnel : courriel d''un client connu');
select tests.clear_authentication();

-- Wilson libère ; l'admin prend le verrou, enregistre une version, revient en arrière.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select public.contract_release_lock('f0000000-0000-0000-0000-0000000000f1');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select is((select acquired from public.contract_acquire_lock('f0000000-0000-0000-0000-0000000000f1')), true,
  'verrou libéré : l''admin le prend');
select is(public.contract_save_version('f0000000-0000-0000-0000-0000000000f1', 'Première version'), 1, 'version 1 enregistrée');
update public.contract_sections set title = 'Parties (modifié)' where contract_id = 'f0000000-0000-0000-0000-0000000000f1';
select is(public.contract_restore_version('f0000000-0000-0000-0000-0000000000f1', 1), 2,
  'retour à la version 1 (la version courante est enregistrée d''abord)');
select is((select title from public.contract_sections where contract_id = 'f0000000-0000-0000-0000-0000000000f1'), 'Parties',
  'retour : sections de la version 1');
select tests.clear_authentication();

-- Wilson n'a plus le verrou : il ne modifie plus le titre.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ update public.contracts set title = 'Autre' where id = 'f0000000-0000-0000-0000-0000000000f1' $$,
  '55006', null, 'verrou tenu par un autre : modification refusée');
-- Annulation avec motif (contrat sans dossier, verrou de Wilson depuis la création) : figé ensuite.
update public.contracts set status = 'cancelled', cancel_reason = 'Client a renoncé' where id = 'f0000000-0000-0000-0000-0000000000f2';
select is((select acquired from public.contract_acquire_lock('f0000000-0000-0000-0000-0000000000f2')), false,
  'contrat annulé : plus de verrou, plus de modification');
select tests.clear_authentication();

select ok(exists (select 1 from audit.events where action = 'contract.created'
                   and resource_id = 'f0000000-0000-0000-0000-0000000000f1'), 'création journalisée');
select ok(exists (select 1 from audit.events where action = 'contract.cancelled'
                   and resource_id = 'f0000000-0000-0000-0000-0000000000f2'), 'annulation journalisée');

select * from finish();
rollback;
