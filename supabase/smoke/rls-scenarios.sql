-- ============================================================================
-- Scénarios RLS — test de fumée (32 cas) — schéma v2.1
-- ============================================================================
-- Validé le 2026-10-01 sur PostgreSQL 16 avec _stub-supabase-auth.sql.
-- Lancer sur une base vierge :
--   psql -f supabase/smoke/_stub-supabase-auth.sql -f supabase/schema.sql -f supabase/smoke/rls-scenarios.sql
-- (sur Supabase local : ne pas charger le stub, le schéma auth existe déjà).
-- Chaque ligne « Txx ok » / valeur « expect » doit être vérifiée.
-- Converti en pgTAP le 2026-10-01 : supabase/tests/database/*.test.sql (BLOQUANTS).
-- Ce fichier reste un test de fumée hors Supabase. Ne jamais supprimer un scénario.
-- ============================================================================
\set ON_ERROR_STOP 0
\pset tuples_only on
-- users
insert into auth.users (id,email,raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','admin@lexcanadalaw.com','{"provider":"azure"}'),
 ('00000000-0000-0000-0000-00000000000b','wilson@lexcanadalaw.com','{"provider":"azure"}'),
 ('00000000-0000-0000-0000-00000000000c','other.staff@lexcanadalaw.com','{"provider":"azure"}'),
 ('00000000-0000-0000-0000-00000000000d','intrus@gmail.com','{"provider":"azure"}'),
 ('00000000-0000-0000-0000-000000000001','john@client.com','{"provider":"email"}'),
 ('00000000-0000-0000-0000-000000000002','jane@client.com','{"provider":"email"}');
select 'T1 roles', string_agg(email||'='||role||'/'||status, ', ' order by email) from public.profiles;
update public.profiles set role='firm_admin' where email='admin@lexcanadalaw.com';
update public.profiles set status='active' where role='client';
-- try: promote gmail user to staff (server) must fail by domain guard
do $$ begin update public.profiles set role='staff' where email='intrus@gmail.com'; raise notice 'T2 FAIL'; exception when others then raise notice 'T2 ok domain guard: %', sqlerrm; end $$;

-- ADMIN session
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
insert into public.matters (id,display_number,title,practice_area,is_mock) values
 ('10000000-0000-0000-0000-000000000001','LC-2026-0142','Permanent Residency Application','Immigration',true),
 ('10000000-0000-0000-0000-000000000002','LC-2026-0115','Commercial Lease Review','Real Estate',true);
insert into public.matter_team values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','responsible');
do $$ begin insert into public.matter_team values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','collaborator'); raise notice 'T3 FAIL'; exception when others then raise notice 'T3 ok client not in team: %', sqlerrm; end $$;
insert into public.matter_access (matter_id,user_id,access_level) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','read_write'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','read');
do $$ begin insert into public.matter_access (matter_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c'); raise notice 'T4 FAIL'; exception when others then raise notice 'T4 ok access only for clients: %', sqlerrm; end $$;
insert into public.documents (matter_id,provider,display_name,scan_status,folder) values
 ('10000000-0000-0000-0000-000000000001','sharepoint','Engagement Agreement.pdf','clean','shared'),
 ('10000000-0000-0000-0000-000000000001','sharepoint','Internal memo.docx','clean','internal'),
 ('10000000-0000-0000-0000-000000000001','supabase_storage','Infected.pdf','infected','client_upload');
select 'T5 admin sees matters', count(*) from public.matters;
reset role;

-- CLIENT John, aal1 (no MFA)
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
select 'T6 john aal1 matters (expect 0)', count(*) from public.matters;
reset role;
-- John aal2
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',false);
set role authenticated;
select 'T7 john aal2 matters (expect LC-2026-0142)', string_agg(display_number,',') from public.matters;
select 'T8 john direct read of jane matter (expect 0)', count(*) from public.matters where id='10000000-0000-0000-0000-000000000002';
select 'T9 john docs (expect Engagement only)', string_agg(display_name,',') from public.documents;
select 'T10 john sees staff profile wilson (expect 1)', count(*) from public.profiles where email='wilson@lexcanadalaw.com';
select 'T11 john sees jane profile (expect 0)', count(*) from public.profiles where email='jane@client.com';
do $$ begin update public.profiles set role='firm_admin' where id=auth.uid(); raise notice 'T12 FAIL'; exception when others then raise notice 'T12 ok cannot change own role: %', sqlerrm; end $$;
update public.profiles set first_name='John' where id=auth.uid();
select 'T13 own name update', first_name from public.profiles where id=auth.uid();
insert into public.conversations (id,matter_id,scope,subject,created_by) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','matter','Question','00000000-0000-0000-0000-000000000001');
insert into public.messages (conversation_id,sender_id,body) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Bonjour Maître');
select 'T14 john messages', count(*) from public.messages;
do $$ begin insert into public.messages (conversation_id,sender_id,body) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','spoof'); raise notice 'T15 FAIL'; exception when others then raise notice 'T15 ok cannot spoof sender: %', sqlerrm; end $$;
do $$ begin perform * from public.list_audit_events(); raise notice 'T16 FAIL'; exception when others then raise notice 'T16 ok client cannot read audit: %', sqlerrm; end $$;
do $$ begin perform 1 from audit.events; raise notice 'T17 FAIL'; exception when others then raise notice 'T17 ok no direct audit access: %', sqlerrm; end $$;
do $$ begin perform 1 from private.sync_jobs; raise notice 'T18 FAIL'; exception when others then raise notice 'T18 ok no private access: %', sqlerrm; end $$;
do $$ begin perform 1 from private.matter_storage_folders; raise notice 'T32 FAIL'; exception when others then raise notice 'T32 ok SharePoint ids not exposed: %', sqlerrm; end $$;
select 'T19 dashboard', * from public.client_dashboard_counts();
reset role;

-- JANE read-only cannot start conversation
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',false);
set role authenticated;
do $$ begin insert into public.conversations (matter_id,scope,created_by) values ('10000000-0000-0000-0000-000000000002','matter',auth.uid()); raise notice 'T20 FAIL'; exception when others then raise notice 'T20 ok read-only cannot message: %', sqlerrm; end $$;
select 'T21 jane sees john conversation (expect 0)', count(*) from public.conversations;
reset role;

-- STAFF Wilson (on team) / other staff (not on team)
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
select 'T22 wilson matters (expect 1)', count(*) from public.matters;
select 'T23 wilson docs (expect 3)', count(*) from public.documents;
do $$ begin insert into public.matter_access (matter_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'); raise notice 'T24 FAIL'; exception when others then raise notice 'T24 ok staff cannot grant access: %', sqlerrm; end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
select 'T25 other staff matters (expect 0)', count(*) from public.matters;
reset role;
-- suspended azure intruder
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated","aal":"aal2"}',false);
set role authenticated;
select 'T26 intruder matters (expect 0)', count(*) from public.matters;
reset role;

-- ADMIN revokes John
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
update public.matter_access set revoked_at=now(), revoke_reason='fin de mandat' where user_id='00000000-0000-0000-0000-000000000001';
do $$ begin update public.matter_access set revoked_at=null where user_id='00000000-0000-0000-0000-000000000001'; raise notice 'T27 FAIL'; exception when others then raise notice 'T27 ok cannot un-revoke: %', sqlerrm; end $$;
select 'T28 audit actions', string_agg(action, ',' order by id) from public.list_audit_events(50);
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',false);
set role authenticated;
select 'T29 john after revoke: matters/docs/messages (expect 0/0/0)', (select count(*) from public.matters),(select count(*) from public.documents),(select count(*) from public.messages);
reset role;
do $$ begin delete from audit.events; raise notice 'T30 FAIL'; exception when others then raise notice 'T30 ok audit append-only even for owner: %', sqlerrm; end $$;
-- anon
select set_config('request.jwt.claims','{"role":"anon"}',false);
set role anon;
do $$ begin perform 1 from public.matters; raise notice 'T31 FAIL'; exception when others then raise notice 'T31 ok anon no access: %', sqlerrm; end $$;
reset role;
