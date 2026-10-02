-- Phase 2 : jetons OAuth dans Supabase Vault (ADR 0014).
begin;
\ir _fixture.psql
select plan(12);

select ok(not has_function_privilege('authenticated', 'public.integration_read_tokens(text, text)', 'EXECUTE'), 'jetons illisibles par un utilisateur');
select ok(not has_function_privilege('authenticated', 'public.integration_save_tokens(text, text, text, text[], uuid)', 'EXECUTE'), 'écriture des jetons réservée au serveur');
select ok(not has_function_privilege('anon', 'public.integration_status_list()', 'EXECUTE'), 'état des connexions fermé à anon');
select ok(not has_table_privilege('authenticated', 'private.integration_connections', 'SELECT'), 'table des connexions inaccessible par l''API');

select public.integration_save_tokens('clio_manage', 'ca', '{"access_token":"a1","refresh_token":"r1"}', array['matters'], null);
select is(public.integration_read_tokens('clio_manage', 'ca'), '{"access_token":"a1","refresh_token":"r1"}', 'jetons relus déchiffrés');
select isnt((select ic.vault_secret_id from private.integration_connections ic where ic.provider = 'clio_manage'), null, 'seule une référence est stockée');
select is((select count(*)::int from vault.secrets s where s.secret like '%a1%'), 0, 'le secret est chiffré dans le coffre (pas de texte clair)');

select public.integration_save_tokens('clio_manage', 'ca', '{"access_token":"a2","refresh_token":"r2"}', array['matters'], null);
select is(public.integration_read_tokens('clio_manage', 'ca'), '{"access_token":"a2","refresh_token":"r2"}', 'rafraîchissement : le même secret est mis à jour');
select is((select count(*)::int from vault.secrets s where s.name = 'oauth:clio_manage:ca'), 1, 'un seul secret par connexion');

-- firm_admin : état visible, jamais de jeton ; client : refusé.
select tests.authenticate_as('a0000000-0000-4000-8000-0000000000a1', 'aal2', 'oauth');
select is((select count(*)::int from public.integration_status_list() where status = 'connected'), 1, 'firm_admin : état visible (sans jeton)');
select tests.clear_authentication();
select tests.authenticate_as('a0000000-0000-4000-8000-000000000001', 'aal2');
select throws_ok($$ select * from public.integration_status_list() $$, '42501', null, 'client : état des connexions refusé');
select tests.clear_authentication();

select public.integration_disconnect('clio_manage', 'ca');
select is(public.integration_read_tokens('clio_manage', 'ca'), null, 'déconnexion : jetons supprimés');

select * from finish();
rollback;
