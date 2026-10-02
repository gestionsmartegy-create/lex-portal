-- Documents : visibilité par sous-dossier SharePoint (ADR 0004), antivirus,
-- identifiants SharePoint jamais exposés. Scénarios : T9, T23, T32.
begin;
\ir _fixture.psql
select plan(8);

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select results_eq($$ select display_name from public.documents order by 1 $$,
  $$ values ('Engagement Agreement.pdf'::text) $$,
  'T9 · le client ne voit que les documents partagés et sains');
select is((select count(*) from public.documents where folder = 'internal'), 0::bigint,
  'Un document du dossier Interne n''est jamais visible du client');
select is((select count(*) from public.documents where scan_status in ('infected', 'pending')), 0::bigint,
  'Un fichier infecté ou en cours d''analyse est invisible');
select throws_ok($$ select 1 from private.matter_storage_folders $$, '42501', null,
  'T32 · les identifiants SharePoint (private) sont inaccessibles');
select throws_ok($$ select external_item_id from public.documents $$, '42501', null,
  'T32 · identifiant SharePoint d''un document illisible via l''API');
select throws_ok($$ select storage_path from public.documents $$, '42501', null,
  'T32 · chemin de quarantaine illisible via l''API');
select throws_ok(
  $$ insert into public.documents (matter_id, provider, display_name) values ('10000000-0000-0000-0000-000000000001', 'sharepoint', 'x.pdf') $$,
  '42501', null, 'Un client ne peut pas créer de document directement (dépôt via le serveur et l''antivirus)');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.documents), 4::bigint, 'T23 · le personnel de l''équipe voit tous les documents');
select tests.clear_authentication();

select * from finish();
rollback;
