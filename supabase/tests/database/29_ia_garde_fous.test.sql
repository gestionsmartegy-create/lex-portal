-- Assistant IA, garde-fous (ADR 0037) : réglages, plafond mensuel, consommation, gabarit en brouillon.
begin;
\ir _fixture.psql
select plan(22);

select ok((select relrowsecurity from pg_class where oid = 'public.ai_settings'::regclass), 'RLS active sur ai_settings');

-- Client : ni réglages, ni réservation.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.ai_settings), 0, 'client : aucun réglage visible');
select throws_ok($$ select public.ai_reserve(null, 'draft', 100, true) $$, '42501', null, 'client : pas d''IA');
select throws_ok($$ select public.ai_complete(gen_random_uuid(), 10, true) $$, '42501', null, 'client : ne termine rien');
select tests.clear_authentication();

-- Personnel connecté par mot de passe (sans Microsoft) : aucun droit (ADR 0009).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2');
select throws_ok($$ select public.ai_reserve(null, 'template', 100, true) $$, '42501', null,
  'personnel sans connexion Microsoft : pas d''IA');
select tests.clear_authentication();

-- Personnel : lit, ne modifie pas ; réserve et termine ; pas de consommation globale.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*)::int from public.ai_settings), 1, 'personnel : lit les réglages');
update public.ai_settings set monthly_cap_cents = 999999;
select is((select monthly_cap_cents from public.ai_settings), 5000, 'personnel : ne change pas le plafond');
insert into public.contracts (id, title, client_name)
values ('f3000000-0000-0000-0000-0000000000a1', 'IA', 'Client');
select throws_ok($$ select public.ai_reserve(null, 'template', 100, true) $$, '42501', null,
  'personnel : pas de gabarit IA (firm_admin seulement)');
select throws_ok($$ select public.ai_reserve(null, 'draft', 100, true) $$, '22023', null,
  'aide à la rédaction : un contrat est exigé');
select set_config('tests.u1', public.ai_reserve('f3000000-0000-0000-0000-0000000000a1', 'draft', 2000, true)::text, true);
select public.ai_complete(current_setting('tests.u1')::uuid, 3000, true);
select is((select count(*)::int from public.ai_month_usage()), 0, 'personnel : pas d''accès à la consommation globale');
select tests.clear_authentication();

select is((select cost_cents from private.ai_usage where id = current_setting('tests.u1')::uuid), 1.0000::numeric,
  'coût calculé par la base : 5 000 caractères × 0,2 ¢ / 1 000');
select is((select status from private.ai_usage where id = current_setting('tests.u1')::uuid), 'done', 'demande terminée');

-- Un autre membre du personnel ne termine pas la demande d'un collègue.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
insert into public.contracts (id, title, client_name)
values ('f3000000-0000-0000-0000-0000000000a2', 'IA 2', 'Client');
select set_config('tests.u2', public.ai_reserve('f3000000-0000-0000-0000-0000000000a2', 'rephrase', 100, true)::text, true);
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select public.ai_complete(current_setting('tests.u2')::uuid, 100, true);
select tests.clear_authentication();
select is((select status from private.ai_usage where id = current_setting('tests.u2')::uuid), 'reserved',
  'on ne termine pas la demande d''un autre');

-- firm_admin : plafond atteint, puis IA désactivée ; consommation du mois ; journal.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
update public.ai_settings set monthly_cap_cents = 1;
select throws_ok($$ select public.ai_reserve('f3000000-0000-0000-0000-0000000000a1', 'draft', 5000, true) $$,
  '54000', null, 'plafond du mois atteint : refus');
update public.ai_settings set enabled = false, monthly_cap_cents = 5000;
select throws_ok($$ select public.ai_reserve('f3000000-0000-0000-0000-0000000000a1', 'draft', 10, true) $$,
  '55000', null, 'IA désactivée : refus');
select is((select requests from public.ai_month_usage()), 2, 'firm_admin : consommation du mois');

-- Gabarit proposé par l'IA : brouillon « à faire valider », jamais publié directement.
select set_config('tests.tpl', public.contract_template_create_draft('Gabarit IA', 'immigration', 'fr',
  '[{"position":0,"title":"Objet","body":{"type":"doc","content":[]},"ai_assisted":true}]')::text, true);
select is((select status || '/' || needs_review::text from public.contract_templates
            where id = current_setting('tests.tpl')::uuid), 'draft/true', 'gabarit IA : brouillon à faire valider');
select throws_ok($$ select public.contract_template_create_draft('X', 'other', 'fr',
  '[{"position":0,"body":{"type":"doc"}}]') $$, '22023', null, 'gabarit : une section sans titre est refusée');
select tests.clear_authentication();

-- anon : aucune fonction d'IA.
set local role anon;
select throws_ok($$ select public.ai_reserve(null, 'template', 1, true) $$, '42501', null, 'anon : pas d''IA');
reset role;

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.contract_template_create_draft('X', 'other', 'fr', '[{"position":0}]') $$,
  '42501', null, 'personnel : ne crée pas de gabarit');
select is((select count(*)::int from public.contract_templates where id = current_setting('tests.tpl')::uuid), 0,
  'personnel : ne voit pas le brouillon de gabarit');
select tests.clear_authentication();

select ok(exists (select 1 from audit.events where action = 'ai.settings_updated')
          and not exists (select 1 from audit.events where metadata::text like '%Objet%'),
  'réglages journalisés ; jamais de contenu');

select * from finish();
rollback;
