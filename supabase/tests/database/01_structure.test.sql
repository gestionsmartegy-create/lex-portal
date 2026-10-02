-- Structure de sécurité : RLS partout, schémas internes fermés, fonctions sûres,
-- privilèges par défaut durcis (ADR 0003, 0007).
begin;
\ir _fixture.psql
select plan(9);

select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'RLS activée sur toutes les tables de public'
);

select is(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
      and t.tablename not in ('external_accounts')  -- lecture seule via politique select : vérifiée ci-dessous
  ),
  0::bigint,
  'Aucune table de public sans politique'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_accounts'),
  'external_accounts a au moins une politique'
);

select ok(
  not has_schema_privilege('authenticated', 'audit', 'USAGE')
  and not has_schema_privilege('anon', 'audit', 'USAGE'),
  'Schéma audit inaccessible à anon et authenticated'
);

-- Par OID (et non par nom) : PostgreSQL peut évaluer has_table_privilege avant
-- le filtre sur le schéma.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind = 'r'
      and (has_table_privilege('authenticated', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'SELECT'))),
  0::bigint,
  'Aucune table de private lisible par anon ou authenticated'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'audit')
      and p.prosecdef
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  0::bigint,
  'Toutes les fonctions security definer ont un search_path vide'
);

select ok(
  not has_function_privilege('anon', 'public.list_audit_events(integer, timestamptz, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.client_dashboard_counts()', 'EXECUTE'),
  'anon ne peut exécuter aucune RPC'
);

-- Privilèges par défaut durcis : une table créée maintenant est fermée par défaut.
create table public.zz_default_privileges_probe (id int);
select ok(
  not has_table_privilege('authenticated', 'public.zz_default_privileges_probe', 'SELECT')
  and not has_table_privilege('anon', 'public.zz_default_privileges_probe', 'SELECT'),
  'Une nouvelle table de public n''est pas accessible sans GRANT explicite'
);
-- Fonctions : PostgreSQL accorde EXECUTE à PUBLIC globalement (voir la migration
-- harden_default_privileges). Garde-fou : AUCUNE fonction de public (hors
-- extensions) ne doit être exécutable par anon — toute migration qui oublie le
-- « revoke … from public, anon » fait échouer ce test.
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '',
  'Aucune fonction de public exécutable par anon'
);

select * from finish();
rollback;
