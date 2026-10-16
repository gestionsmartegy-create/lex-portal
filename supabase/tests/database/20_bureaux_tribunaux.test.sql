-- Bureaux et tribunaux (ADR 0024) : lecture par le personnel, écriture par le firm_admin, aucun droit induit.
begin;
\ir _fixture.psql
select plan(32);

select is((select count(*)::int from public.offices), 4, 'quatre bureaux de départ (Moncton, Ottawa, Halifax, Montréal)');
select is((select province || ' ' || timezone from public.offices order by position limit 1), 'NB America/Halifax',
  'Moncton (siège social) en premier, heure de l''Atlantique');
select is((select count(*)::int from public.offices where address is not null), 3, 'adresses publiées : Moncton, Halifax, Ottawa');
select ok((select count(*) from public.courts) >= 16, 'liste de départ des tribunaux (dont Nouveau-Brunswick)');
select ok((select relrowsecurity from pg_class where oid = 'public.offices'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.courts'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.staff_offices'::regclass), 'RLS active');

-- firm_admin : crée, modifie, archive ; rattache le personnel et un dossier.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ insert into public.offices (name_fr, name_en, city, province, timezone)
  values ('Essai', 'Test', 'Moncton', 'NB', 'America/Halifax') $$, 'firm_admin : crée un bureau');
select throws_ok($$ insert into public.offices (name_fr, name_en, city, province, timezone)
  values ('ottawa', 'Ottawa 2', 'Ottawa', 'ON', 'America/Toronto') $$, '23505', null, 'nom en double refusé');
select throws_ok($$ insert into public.offices (name_fr, name_en, city, province, timezone)
  values ('Paris', 'Paris', 'Paris', 'XX', 'Europe/Paris') $$, '23514', null, 'province ou fuseau hors liste refusé');
select throws_ok($$ insert into public.courts (name_fr, name_en, province) values ('Sans fuseau', 'No zone', 'ON') $$,
  '23514', null, 'tribunal provincial sans fuseau refusé');
select lives_ok($$ insert into public.staff_offices (user_id, office_id, is_primary)
  select '00000000-0000-0000-0000-00000000000b', id, true from public.offices where name_en = 'Halifax' $$,
  'firm_admin : bureau principal d''un membre du personnel');
select throws_ok($$ insert into public.staff_offices (user_id, office_id, is_primary)
  select '00000000-0000-0000-0000-00000000000b', id, true from public.offices where name_en = 'Ottawa' $$,
  '23505', null, 'un seul bureau principal');
select throws_ok($$ insert into public.staff_offices (user_id, office_id)
  select '00000000-0000-0000-0000-000000000001', id from public.offices where name_en = 'Ottawa' $$,
  '23514', null, 'un client ne peut pas être rattaché à un bureau');
select lives_ok($$ update public.offices set is_active = false where name_en = 'Test' $$, 'firm_admin : archive un bureau');
select throws_ok($$ insert into public.staff_offices (user_id, office_id)
  select '00000000-0000-0000-0000-00000000000c', id from public.offices where name_en = 'Test' $$,
  '23514', null, 'pas de rattachement à un bureau archivé');
select throws_ok($$ delete from public.offices where name_en = 'Test' $$, '42501', null, 'pas de suppression de bureau');
select tests.clear_authentication();

-- Personnel de l'équipe : lit, ne modifie pas ; place son dossier dans un bureau.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*)::int from public.offices where is_active), 4, 'personnel : lit les bureaux actifs');
select is((select count(*)::int from public.offices where name_en = 'Ottawa' and city = 'Ottawa'), 1, 'personnel : lit un bureau');
update public.offices set city = 'Pirate' where name_en = 'Ottawa';
select is((select city from public.offices where name_en = 'Ottawa'), 'Ottawa', 'personnel : ne modifie pas un bureau');
select throws_ok($$ insert into public.courts (name_fr, name_en, province, timezone) values ('X', 'X', 'ON', 'America/Toronto') $$,
  '42501', null, 'personnel : ne crée pas de tribunal');
select lives_ok($$ update public.matters set office_id = (select id from public.offices where name_en = 'Halifax')
  where id = '10000000-0000-0000-0000-000000000001' $$, 'équipe : place son dossier dans un bureau');
select throws_ok($$ update public.matters set office_id = (select id from public.offices where name_en = 'Test')
  where id = '10000000-0000-0000-0000-000000000001' $$, '23514', null, 'pas de dossier dans un bureau archivé');
select tests.clear_authentication();
select ok(exists (select 1 from audit.events where action = 'matter.office_set'), 'audit : bureau du dossier journalisé');

-- Écriture hors équipe : le bureau d'un dossier d'une autre équipe ne change pas.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
update public.matters set office_id = (select id from public.offices where name_en = 'Ottawa')
 where id = '10000000-0000-0000-0000-000000000001';
select throws_ok($$ insert into public.staff_offices (user_id, office_id)
  select '00000000-0000-0000-0000-00000000000c', id from public.offices where name_en = 'Ottawa' $$,
  '42501', null, 'personnel non-admin : pas de rattachement');
select throws_ok($$ select public.set_staff_offices('00000000-0000-0000-0000-00000000000c',
  (select id from public.offices where name_en = 'Ottawa'), '{}') $$, '42501', null,
  'personnel non-admin : set_staff_offices refusé');
select tests.clear_authentication();
select is((select o.name_en from public.matters m join public.offices o on o.id = m.office_id
            where m.id = '10000000-0000-0000-0000-000000000001'), 'Halifax',
  'personnel hors équipe : le bureau du dossier n''a pas changé');

-- Client : ne change pas le bureau de son dossier.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
update public.matters set office_id = (select id from public.offices where name_en = 'Ottawa')
 where id = '10000000-0000-0000-0000-000000000001';
select tests.clear_authentication();
select is((select o.name_en from public.matters m join public.offices o on o.id = m.office_id
            where m.id = '10000000-0000-0000-0000-000000000001'), 'Halifax',
  'client : le bureau du dossier n''a pas changé');

-- set_staff_offices (firm_admin) : une seule transaction, rattachement archivé conservé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
update public.offices set is_active = true where name_en = 'Test';
insert into public.staff_offices (user_id, office_id)
  select '00000000-0000-0000-0000-00000000000b', id from public.offices where name_en = 'Test';
update public.offices set is_active = false where name_en = 'Test';
select lives_ok($$ select public.set_staff_offices('00000000-0000-0000-0000-00000000000b',
  (select id from public.offices where name_en = 'Montreal'),
  array[(select id from public.offices where name_en = 'Halifax')]) $$, 'firm_admin : nouveau bureau principal');
select is((select string_agg(o.name_en || ':' || so.is_primary, ',' order by o.name_en)
             from public.staff_offices so join public.offices o on o.id = so.office_id
            where so.user_id = '00000000-0000-0000-0000-00000000000b'),
  'Halifax:false,Montreal:true,Test:false', 'principal changé, ancien principal gardé, archivé conservé');
select throws_ok($$ select public.set_staff_offices('00000000-0000-0000-0000-000000000001',
  (select id from public.offices where name_en = 'Ottawa'), '{}') $$, '23514', null,
  'set_staff_offices : client refusé, rien n''est modifié');
select throws_ok($$ insert into public.matters (display_number, title, status, office_id)
  select 'X-ARCH', 'Dossier archivé', 'open', id from public.offices where name_en = 'Test' $$,
  '23514', null, 'création d''un dossier dans un bureau archivé refusée');
select tests.clear_authentication();

-- Le bureau ne donne aucun droit : le collègue rattaché au même bureau ne voit pas le dossier d'une autre équipe.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select public.set_staff_offices('00000000-0000-0000-0000-00000000000c',
  (select id from public.offices where name_en = 'Halifax'), '{}');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.matters where id = '10000000-0000-0000-0000-000000000001'), 0,
  'personnel hors équipe : aucun accès au dossier par le bureau');
select tests.clear_authentication();

-- Client : ne voit ni bureaux, ni tribunaux, ni rattachements.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.offices) + (select count(*)::int from public.courts)
  + (select count(*)::int from public.staff_offices), 0, 'client : rien');
select tests.clear_authentication();

select * from finish();
rollback;
