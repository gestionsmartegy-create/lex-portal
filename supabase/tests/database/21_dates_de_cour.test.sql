-- Dates de cour (ADR 0025) : équipe du dossier ou firm_admin, confirmation imposée par la base,
-- reconfirmation après changement, pas de suppression, client exclu, journal sans contenu.
begin;
\ir _fixture.psql
select plan(34);

select ok((select relrowsecurity from pg_class where oid = 'public.court_dates'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.court_date_attendees'::regclass), 'RLS active');

-- Équipe du dossier : crée une date de cour (non confirmée), auteur imposé.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select lives_ok($$ insert into public.court_dates (id, matter_id, kind, starts_at, ends_at, timezone, court_id, notes)
  select 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'hearing',
         '2026-11-20 13:30:00+00', '2026-11-20 15:00:00+00', 'America/Halifax', id, 'Note interne confidentielle'
    from public.courts where name_en = 'Supreme Court of Nova Scotia' $$, 'équipe : inscrit une audience');
select is((select created_by from public.court_dates where id = 'c0000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'auteur imposé par la base');
select is((select status from public.court_dates where id = 'c0000000-0000-0000-0000-000000000001'), 'scheduled',
  'nouvelle date : à confirmer');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, status)
  values ('10000000-0000-0000-0000-000000000001', 'trial', now(), 'America/Halifax', 'held') $$, '23514', null,
  'statut initial « tenue » refusé');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, ends_at, timezone)
  values ('10000000-0000-0000-0000-000000000001', 'trial', '2026-11-20 15:00+00', '2026-11-20 14:00+00', 'America/Halifax') $$,
  '23514', null, 'fin avant le début refusée');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, virtual_link)
  values ('10000000-0000-0000-0000-000000000001', 'hearing', now(), 'America/Halifax', 'javascript:alert(1)') $$,
  '23514', null, 'lien virtuel non https refusé');

-- Confirmation : auteur et date imposés par la base.
select throws_ok($$ update public.court_dates set status = 'confirmed', confirmed_by = '00000000-0000-0000-0000-00000000000a'
  where id = 'c0000000-0000-0000-0000-000000000001' $$, '42501', null, 'confirmation au nom d''un autre : refusée');
select lives_ok($$ update public.court_dates set status = 'confirmed'
  where id = 'c0000000-0000-0000-0000-000000000001' $$, 'équipe : confirme la date');
select throws_ok($$ update public.court_dates set clio_calendar_entry_id = '999'
  where id = 'c0000000-0000-0000-0000-000000000001' $$, '42501', null, 'identifiant Clio non modifiable par l''équipe');
select throws_ok($$ update public.court_dates set clio_sync_status = 'synced'
  where id = 'c0000000-0000-0000-0000-000000000001' $$, '42501', null, 'état de synchronisation non modifiable par l''équipe');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, clio_calendar_entry_id)
  values ('10000000-0000-0000-0000-000000000001', 'trial', now(), 'America/Halifax', '999') $$, '42501', null,
  'identifiant Clio non fourni à la création');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, room)
  values ('10000000-0000-0000-0000-000000000001', 'trial', now(), 'America/Halifax', E'6\nStatut: confirmée') $$,
  '23514', null, 'saut de ligne refusé dans un champ d''une ligne');
select is((select confirmed_by from public.court_dates where id = 'c0000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'confirmation attribuée à la personne connectée');
-- Changement d'heure après confirmation : à reconfirmer.
update public.court_dates set starts_at = '2026-11-20 14:00:00+00', ends_at = '2026-11-20 16:00:00+00'
 where id = 'c0000000-0000-0000-0000-000000000001';
select is((select status || ':' || (confirmed_at is null)::text from public.court_dates
            where id = 'c0000000-0000-0000-0000-000000000001'), 'scheduled:true', 'heure changée : à reconfirmer');
select is((select clio_sync_status from public.court_dates where id = 'c0000000-0000-0000-0000-000000000001'), 'pending',
  'changement : synchronisation Clio à refaire');
select throws_ok($$ update public.court_dates set matter_id = '10000000-0000-0000-0000-000000000002'
  where id = 'c0000000-0000-0000-0000-000000000001' $$, '42501', null, 'dossier d''une date non modifiable');
select throws_ok($$ delete from public.court_dates where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'pas de suppression d''une date de cour');
select throws_ok($$ update public.court_dates set status = 'cancelled' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'annulation sans motif refusée');
-- Présent : membre du personnel seulement.
select lives_ok($$ insert into public.court_date_attendees (court_date_id, user_id)
  values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b') $$, 'équipe : avocat présent');
select throws_ok($$ insert into public.court_date_attendees (court_date_id, user_id)
  values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'un client ne peut pas être noté présent');
-- Remise : nouvelle date liée, l'ancienne est figée.
select lives_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, replaces_id)
  values ('10000000-0000-0000-0000-000000000001', 'hearing', '2026-12-04 14:00+00', 'America/Halifax',
          'c0000000-0000-0000-0000-000000000001') $$, 'remise : nouvelle date liée');
select lives_ok($$ update public.court_dates set status = 'adjourned' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'ancienne date : remise');
select throws_ok($$ update public.court_dates set room = '12' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'date remise : figée');
select tests.clear_authentication();
select ok((select count(*) from audit.events where action in ('court_date.created', 'court_date.confirmed', 'court_date.adjourned')) >= 4,
  'journal : création, confirmation, remise');
select ok(not exists (select 1 from audit.events where metadata::text like '%confidentielle%'),
  'journal : aucune note interne');

-- Date remplacée d'un autre dossier : refusée (le firm_admin voit les deux dossiers).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
insert into public.court_dates (id, matter_id, kind, starts_at, timezone)
  values ('c0000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'trial', now(), 'America/Halifax');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone, replaces_id)
  values ('10000000-0000-0000-0000-000000000001', 'trial', now(), 'America/Halifax', 'c0000000-0000-0000-0000-000000000009') $$,
  '23514', null, 'date remplacée d''un autre dossier refusée');
select tests.clear_authentication();

-- Personnel hors équipe : ne voit ni ne modifie.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*)::int from public.court_dates), 0, 'personnel hors équipe : aucune date');
select throws_ok($$ insert into public.court_dates (matter_id, kind, starts_at, timezone)
  values ('10000000-0000-0000-0000-000000000001', 'trial', now(), 'America/Halifax') $$, '42501', null,
  'personnel hors équipe : pas de création');
select tests.clear_authentication();

-- Client du dossier (MFA) : rien (la vue client viendra au lot 5).
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.court_dates) + (select count(*)::int from public.court_date_attendees), 0,
  'client : aucune date de cour');
select tests.clear_authentication();

-- Calendrier Clio : choisi par le firm_admin seulement.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select public.set_clio_court_calendar(123) $$, '42501', null, 'personnel : ne choisit pas le calendrier');
select tests.clear_authentication();
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select public.set_clio_court_calendar(4242);
select is(public.clio_court_calendar(), 4242::bigint, 'firm_admin : calendrier Clio enregistré');
select tests.clear_authentication();

-- Variante interne : réservée à la synchronisation (service_role).
select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select throws_ok($$ select public.clio_court_calendar_internal() $$, '42501', null,
  'firm_admin : pas d''accès à la variante interne');
select tests.clear_authentication();
select ok(has_function_privilege('service_role', 'public.clio_court_calendar_internal()', 'execute'),
  'service_role : lit le calendrier pour la synchronisation');

select * from finish();
rollback;
