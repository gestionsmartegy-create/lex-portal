-- Contrats, lot 2 (ADR 0034) : modèles, clauses, services, taxes, tableau des services.
begin;
\ir _fixture.psql
select plan(32);

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.contract_templates'::regclass, 'public.contract_template_versions'::regclass, 'public.service_catalog'::regclass,
  'public.contract_line_items'::regclass, 'public.tax_rates'::regclass, 'public.contract_clauses'::regclass,
  'public.contract_clause_history'::regclass)), 'RLS active sur les sept tables');

-- Personnel (…0b) : modèles publiés seulement ; aucune écriture dans la bibliothèque.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*)::int from public.contract_templates), 3, 'personnel : seulement les modèles publiés');
select is((select count(*)::int from public.contract_templates where needs_review), 0, 'personnel : pas les traductions à valider');
update public.contract_templates set name = 'Piraté' where id = '10000000-0000-4000-8000-0000000c0001';
select is((select name from public.contract_templates where id = '10000000-0000-4000-8000-0000000c0001'),
  'Client Service Terms — Businesses & Organizations', 'personnel : ne renomme pas un modèle');
select throws_ok($$ insert into public.service_catalog (name_fr, name_en, pricing, amount) values ('X', 'X', 'flat', 1) $$,
  '42501', null, 'personnel : pas de service au catalogue');
select throws_ok($$ insert into public.tax_rates (province, tax_code, rate, effective_from) values ('ON', 'HST', 0, '2026-01-01') $$,
  '42501', null, 'personnel : pas de taux de taxe');
select throws_ok($$ insert into public.contract_clauses (title, language, body) values ('X', 'fr', 'Y') $$,
  '42501', null, 'personnel : pas de clause');
select throws_ok($$ select public.contract_template_from_contract(gen_random_uuid(), 'X', 'other', 'clio') $$,
  '42501', null, 'personnel : ne crée pas de modèle');
select is((select count(*)::int from public.tax_rates), 8, 'personnel : lit les taux de taxes');

-- Contrat à partir d'un modèle publié ; jamais d'un brouillon de traduction.
select lives_ok($$ insert into public.contracts (id, title, client_name, matter_id, template_id, template_version, client_province)
  values ('f0000000-0000-0000-0000-0000000000a1', 'Conditions', 'Client Démo', '10000000-0000-0000-0000-000000000001',
          '10000000-0000-4000-8000-0000000c0002', 1, 'NS') $$, 'personnel : contrat à partir d''un modèle publié');
select throws_ok($$ insert into public.contracts (title, client_name, template_id, template_version)
  values ('X', 'Y', '10000000-0000-4000-8000-0000000c0003', 1) $$, '23514', null, 'personnel : pas à partir d''un brouillon');
select throws_ok($$ insert into public.contracts (title, client_name, template_id, template_version, template_draft)
  values ('X', 'Y', '10000000-0000-4000-8000-0000000c0001', 1, true) $$, '42501', null, 'personnel : pas de brouillon de modèle');
select throws_ok($$ insert into public.contracts (title, client_name, client_province) values ('X', 'Y', 'XX') $$,
  '23514', null, 'province inconnue refusée');
-- Tableau des services : verrou tenu (auteur), quantité et prix exacts.
select lives_ok($$ insert into public.contract_line_items (contract_id, position, description, quantity, unit_price)
  values ('f0000000-0000-0000-0000-0000000000a1', 0, 'Consultation initiale', 1.5, 250.00) $$, 'auteur : ajoute une ligne de service');
select throws_ok($$ insert into public.contract_line_items (contract_id, description, quantity, unit_price)
  values ('f0000000-0000-0000-0000-0000000000a1', 'X', 0, 1) $$, '23514', null, 'quantité nulle refusée');
select lives_ok($$ select public.contract_replace_lines('f0000000-0000-0000-0000-0000000000a1',
  '[{"description": "A", "pricing": "flat", "quantity": "1", "unit_price": "100.00"},
    {"description": "B", "pricing": "hourly", "quantity": "2.5", "unit_price": "300.00"}]') $$,
  'auteur : remplace le tableau des services');
select is((select string_agg(description, ',' order by position) from public.contract_line_items
            where contract_id = 'f0000000-0000-0000-0000-0000000000a1'), 'A,B', 'tableau remplacé dans l''ordre');
select throws_ok($$ select public.contract_template_publish(gen_random_uuid()) $$,
  '42501', null, 'personnel : ne publie pas de modèle');
update public.contract_templates set status = 'archived' where id = '10000000-0000-4000-8000-0000000c0001';
select is((select status from public.contract_templates where id = '10000000-0000-4000-8000-0000000c0001'),
  'published', 'personnel : n''archive pas un modèle');
-- Sans le verrou, le tableau des services ne s'écrit plus et reste intact.
select public.contract_release_lock('f0000000-0000-0000-0000-0000000000a1');
select throws_ok($$ insert into public.contract_line_items (contract_id, position, description, quantity, unit_price)
  values ('f0000000-0000-0000-0000-0000000000a1', 5, 'Sans verrou', 1, 10) $$, '42501', null,
  'sans verrou : pas de ligne de service');
select public.contract_replace_lines('f0000000-0000-0000-0000-0000000000a1', '[]');
select is((select count(*)::int from public.contract_line_items where contract_id = 'f0000000-0000-0000-0000-0000000000a1'),
  2, 'sans verrou : le tableau n''est pas vidé');
select tests.clear_authentication();

-- Autre membre du personnel (hors équipe) et client : aucune ligne visible.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.contract_line_items), 0, 'hors équipe : aucune ligne de service');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.contract_templates) + (select count(*)::int from public.service_catalog), 0,
  'client : ni modèles ni catalogue');
select tests.clear_authentication();

-- Admin : clause modifiée → version 2 et historique ; modèle publié à partir d'un brouillon de traduction.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select is((select count(*)::int from public.contract_templates), 5, 'admin : tous les modèles, brouillons compris');
update public.contract_clauses set body = body || ' Texte révisé.' where title = 'Retainer in trust';
select is((select version from public.contract_clauses where title = 'Retainer in trust'), 2, 'clause modifiée : version 2');
select is((select count(*)::int from public.contract_clause_history h join public.contract_clauses c on c.id = h.clause_id
            where c.title = 'Retainer in trust'), 1, 'clause modifiée : ancienne version gardée');
select lives_ok($$ insert into public.contracts (id, title, client_name, template_id, template_version, template_draft)
  values ('f0000000-0000-0000-0000-0000000000a2', 'Relecture FR', 'Modèle', '10000000-0000-4000-8000-0000000c0003', 1, true) $$,
  'admin : brouillon d''un modèle à valider');
select is(public.contract_template_publish('f0000000-0000-0000-0000-0000000000a2'), 2, 'publication : version 2');
select is((select status || '/' || needs_review::text from public.contract_templates where id = '10000000-0000-4000-8000-0000000c0003'),
  'published/false', 'publication : modèle validé et publié');
select throws_ok($$ update public.contract_templates set status = 'published'
  where id = '10000000-0000-4000-8000-0000000c0004' $$, '42501', null, 'admin : pas de publication par simple mise à jour');
select set_config('tests.new_template', public.contract_template_from_contract(
  'f0000000-0000-0000-0000-0000000000a1', 'Depuis un contrat', 'other', 'portal')::text, true);
select is((select status from public.contract_templates t where t.id = current_setting('tests.new_template')::uuid),
  'draft', 'enregistrer comme modèle : créé en brouillon');
select tests.clear_authentication();

select ok(exists (select 1 from audit.events where action = 'contract_template.published'), 'publication journalisée');

select * from finish();
rollback;
