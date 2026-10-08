-- Étiquettes de dossiers (ADR 0021).
begin;
\ir _fixture.psql
select plan(17);

select ok((select count(*) from public.matter_tags) >= 6, 'étiquettes de départ présentes');

-- Personnel de l'équipe : lit les étiquettes, en pose sur son dossier, n'en crée pas.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select ok((select count(*) from public.matter_tags) >= 6, 'équipe : lit les étiquettes');
select lives_ok($$ insert into public.matter_tag_links (matter_id, tag_id)
  select '10000000-0000-0000-0000-000000000001', id from public.matter_tags where name_en in ('Urgent', 'File complete') $$,
  'équipe : pose deux étiquettes sur son dossier');
select throws_ok($$ insert into public.matter_tag_links (matter_id, tag_id)
  select '10000000-0000-0000-0000-000000000002', id from public.matter_tags where name_en = 'Urgent' $$,
  '42501', null, 'équipe : rien sur un dossier hors équipe');
select throws_ok($$ insert into public.matter_tags (name_fr, name_en) values ('x', 'x') $$, '42501', null,
  'équipe : ne crée pas d''étiquette');
select tests.clear_authentication();
select is((select created_by from public.matter_tag_links limit 1), '00000000-0000-0000-0000-00000000000b'::uuid,
  'auteur posé par la base');

-- Client du dossier : voit seulement l'étiquette visible, n'en pose aucune.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.matter_tag_links), 1, 'client : voit seulement le lien visible');
select is((select string_agg(name_en, ',') from public.matter_tags), 'File complete', 'client : seulement l''étiquette visible');
select throws_ok($$ insert into public.matter_tag_links (matter_id, tag_id)
  select '10000000-0000-0000-0000-000000000001', id from public.matter_tags limit 1 $$, '42501', null,
  'client : ne pose aucune étiquette');
select tests.clear_authentication();

-- Client du dossier sans double vérification (aal1) : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*)::int from public.matter_tag_links), 0, 'client sans MFA : aucun lien');
select is((select count(*)::int from public.matter_tags), 0, 'client sans MFA : aucune étiquette');
select tests.clear_authentication();

-- Autre client et personnel hors équipe : rien.
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.matter_tags), 0, 'autre client : aucune étiquette');
select is((select count(*)::int from public.matter_tag_links), 0, 'autre client : aucun lien');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.matter_tag_links), 0, 'personnel hors équipe : aucun lien');
select tests.clear_authentication();

-- firm_admin : crée une étiquette, en change la visibilité (journalisé).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_tags (name_fr, name_en, color) values ('Essai', 'Test', 'blue') $$,
  'firm_admin : crée une étiquette');
select lives_ok($$ update public.matter_tags set visible_to_client = true where name_en = 'Urgent' $$,
  'firm_admin : rend une étiquette visible');
select tests.clear_authentication();
select ok((select count(*) from audit.events where action in ('matter_tag.added', 'matter_template.field_visibility')) >= 3,
  'audit : poses et changement de visibilité journalisés');

select * from finish();
rollback;
