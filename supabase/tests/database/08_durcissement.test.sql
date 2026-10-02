-- J2.1 — Durcissement (ADR 0009) : un test par correctif de la revue de sécurité.
-- E1 auth du personnel · E2 session valide partout · M1 moindre privilège ·
-- M2 action_url · M3 e-mail · F1/F2 colonnes · F3 auteurs · isolation financière.
begin;
\ir _fixture.psql
select plan(49);

-- Données complémentaires (serveur)
insert into public.documents (id, matter_id, provider, display_name, scan_status, folder) values
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'sharepoint', 'Lease.pdf', 'clean', 'shared');
insert into public.invoices (id, matter_id, invoice_number, amount_total, balance_due) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'INV-JOHN', 100, 100),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'INV-JANE', 200, 200);
insert into public.payments (invoice_id, payer_id, provider, idempotency_key, amount) values
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'mock', 'idem-jane', 200);
insert into public.document_requests (matter_id, requested_from, title) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Pièce de Jane');
insert into public.signature_requests (matter_id, document_id, signer_id) values
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');
insert into public.conversations (id, scope, subject, created_by) values
  ('20000000-0000-0000-0000-000000000009', 'general', 'Général', '00000000-0000-0000-0000-00000000000b');
insert into public.conversation_participants (conversation_id, user_id) values
  ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001');
insert into public.messages (conversation_id, sender_id, body) values
  ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'Message général');
insert into public.notifications (user_id, type, title) values
  ('00000000-0000-0000-0000-000000000001', 'new_message', 'Nouveau message');
insert into public.organizations (id, name) values ('50000000-0000-0000-0000-000000000001', 'Org de John');
insert into public.organization_members (organization_id, user_id) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

-- ============================ E1 : personnel ============================
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'password');
select is((select count(*) from public.matters), 0::bigint, 'E1 · personnel connecté par mot de passe : aucun droit');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.matters), 1::bigint, 'E1 · personnel connecté par Microsoft : droits de son équipe');
select tests.clear_authentication();

-- Contre-revue : « mot de passe oublié » + TOTP auto-enrôlé (aal2) ne doit RIEN donner.
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal2', 'password');
select is((select count(*) from public.matters), 0::bigint, 'E1 · personnel par mot de passe + MFA Supabase (aal2) : aucun droit');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal2', 'recovery');
select throws_ok($$ select * from public.list_audit_events() $$, '42501', null,
  'E1 · firm_admin via lien de récupération + aal2 : pas d''accès à l''audit');
select tests.clear_authentication();

-- OAuth d'un AUTRE fournisseur que Microsoft : aucun droit
update auth.users set raw_app_meta_data = '{"provider": "google", "providers": ["google"]}'
  where id = '00000000-0000-0000-0000-00000000000b';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.matters), 0::bigint, 'E1 · OAuth non Microsoft : aucun droit');
select tests.clear_authentication();
-- Compte pré-créé (provider « email ») puis identité Microsoft liée : droits accordés
update auth.users set raw_app_meta_data = '{"provider": "email", "providers": ["email", "azure"]}'
  where id = '00000000-0000-0000-0000-00000000000b';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.matters), 1::bigint, 'E1 · compte pré-créé + identité Microsoft liée : droits de son équipe');
select tests.clear_authentication();
update auth.users set raw_app_meta_data = '{"provider": "azure"}' where id = '00000000-0000-0000-0000-00000000000b';

select throws_ok($$ update private.staff_email_domains set allow_password = true where domain = 'lexcanadalaw.com' $$,
  '23514', null, 'E1 · le mot de passe ne peut jamais être autorisé pour le vrai domaine du cabinet');

select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'password');
select throws_ok($$ select * from public.list_audit_events() $$, '42501', null,
  'E1 · firm_admin par mot de passe : pas d''accès à l''audit');
select tests.clear_authentication();

-- Domaine de test autorisé au mot de passe (comptes fictifs locaux)
insert into private.staff_email_domains (domain, allow_password) values ('lexcanadalaw.test', true)
  on conflict (domain) do update set allow_password = true;
insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'probe.staff@lexcanadalaw.test', '{"provider":"azure"}', 'authenticated', 'authenticated');
insert into public.matter_team (matter_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1', 'aal1', 'password');
select is((select count(*) from public.matters), 1::bigint, 'E1 · domaine de test : mot de passe accepté (local uniquement)');
select tests.clear_authentication();

update public.profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-00000000000b';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.matters), 0::bigint, 'E1 · personnel désactivé : plus aucun droit, même par Microsoft');
select tests.clear_authentication();
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-00000000000b';

-- ============================ E2 : session valide ============================
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*) from public.conversations), 0::bigint, 'E2 · client sans MFA : aucun fil, même général');
select is((select count(*) from public.messages), 0::bigint, 'E2 · client sans MFA : aucun message');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body) values ('20000000-0000-0000-0000-000000000009', auth.uid(), 'x') $$,
  '42501', null, 'E2 · client sans MFA : écriture refusée dans un fil général');
select is((select count(*) from public.notifications), 0::bigint, 'E2 · client sans MFA : aucune notification');
select is((select count(*) from public.notification_preferences), 0::bigint, 'E2 · client sans MFA : préférences illisibles');
update public.profiles set first_name = 'X' where id = auth.uid();  -- filtré par la RLS : 0 ligne
select ok((select first_name from public.profiles where id = auth.uid()) is distinct from 'X',
  'E2 · client sans MFA : profil non modifiable');
select is((select count(*) from public.profiles where id = auth.uid()), 1::bigint,
  'E2 · client sans MFA : lit son propre profil (enrôlement MFA)');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*) from public.conversations where scope = 'general'), 1::bigint, 'E2 · avec MFA : fil général visible');
select is((select count(*) from public.notifications), 1::bigint, 'E2 · avec MFA : notification visible');
select tests.clear_authentication();

update public.profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*) from public.conversations) + (select count(*) from public.notifications)
          + (select count(*) from public.profiles), 0::bigint,
  'E2 · compte désactivé : plus rien, même avec MFA');
select tests.clear_authentication();
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000001';

update public.profiles set status = 'invited' where id = '00000000-0000-0000-0000-000000000002';
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal1');
select is((select count(*) from public.profiles), 0::bigint,
  'E2 · compte encore « invited » : aucun profil lisible (activation serveur avant MFA, J3)');
select tests.clear_authentication();
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000002';

-- ============================ M1 : moindre privilège ============================
select tests.authenticate_as('00000000-0000-0000-0000-00000000000c', 'aal1', 'oauth');
select is((select count(*) from public.conversation_participants), 0::bigint, 'M1 · personnel hors équipe : aucun participant');
select is((select count(*) from public.organizations), 0::bigint, 'M1 · personnel hors équipe : aucune organisation cliente');
select is((select count(*) from public.profiles where role = 'client'), 0::bigint, 'M1 · personnel hors équipe : aucun profil client');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.organizations), 1::bigint, 'M1 · personnel du dossier : voit l''organisation de son client');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 1::bigint,
  'M1 · personnel du dossier : voit son client');
select tests.clear_authentication();

update public.matter_access set revoked_at = now() where user_id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 0::bigint,
  'M1 · accès révoqué : le personnel ne voit plus ce client');
select tests.clear_authentication();
-- Nouvel octroi à John sur son dossier (un accès révoqué ne se réactive jamais)
insert into public.matter_access (matter_id, user_id, access_level)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'read_write');

-- ============================ M2 : action_url ============================
select throws_ok($$ insert into public.notifications (user_id, type, title, action_url)
  values ('00000000-0000-0000-0000-000000000001', 'new_message', 't', '//evil.example/phish') $$,
  '23514', null, 'M2 · « //evil.example » refusé');
select throws_ok($$ insert into public.notifications (user_id, type, title, action_url)
  values ('00000000-0000-0000-0000-000000000001', 'new_message', 't', '/\evil.example') $$,
  '23514', null, 'M2 · « /\evil.example » refusé');
select throws_ok($$ insert into public.notifications (user_id, type, title, action_url)
  values ('00000000-0000-0000-0000-000000000001', 'new_message', 't', 'https://evil.example') $$,
  '23514', null, 'M2 · URL absolue refusée');
select lives_ok($$ insert into public.notifications (user_id, type, title, action_url)
  values ('00000000-0000-0000-0000-000000000001', 'new_message', 't', '/portal/documents?tab=signed') $$,
  'M2 · chemin interne accepté');

-- ============================ M3 : e-mail ============================
select throws_ok($$ update auth.users set email = 'prise@lexcanadalaw.com' where id = '00000000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'M3 · un client ne peut pas prendre une adresse du personnel');
update auth.users set email = 'jane.nouvelle@example.com' where id = '00000000-0000-0000-0000-000000000002';
select is((select email from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'jane.nouvelle@example.com', 'M3 · le profil suit le changement d''e-mail');

-- ============================ F1 / F2 / F3 ============================
select tests.authenticate_as('00000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok($$ select revoke_reason from public.matter_access $$, '42501', null,
  'F1 · le client ne lit pas les motifs de révocation');
select throws_ok($$ select clio_matter_id from public.matters $$, '42501', null, 'F2 · identifiant Clio illisible');
select throws_ok($$ select clio_state from public.invoices $$, '42501', null, 'F2 · état Clio de la facture illisible');
select throws_ok($$ select provider_reference from public.payments $$, '42501', null, 'F2 · référence de paiement illisible');
select throws_ok($$ select clio_contact_id from public.organizations $$, '42501', null, 'F2 · contact Clio illisible');
select throws_ok($$ select external_id from public.external_accounts $$, '42501', null, 'F2 · identifiant externe illisible');
select throws_ok($$ select * from public.matters $$, '42501', null, 'Garde · « select * » refusé sur une table à colonnes restreintes');
select throws_ok($$ select * from public.list_matter_access('10000000-0000-0000-0000-000000000002') $$, '42501', null,
  'F1 · un client ne peut pas lister l''historique des accès');
-- Isolation financière et documentaire entre clients (Jane voit les siens, pas ceux de John)
select is((select string_agg(invoice_number, ',') from public.invoices), 'INV-JANE', 'Isolation · factures');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000a', 'aal1', 'oauth');
select lives_ok($$ insert into public.matter_access (matter_id, user_id, granted_by)
  values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b') $$,
  'F3 · le firm_admin octroie un accès');
select tests.clear_authentication();
select is((select granted_by from public.matter_access
            where matter_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'F3 · l''auteur enregistré est l''utilisateur connecté, pas celui déclaré');
select throws_ok($$ update public.matter_access set revoke_reason = 'réécrit'
  where user_id = '00000000-0000-0000-0000-000000000002' $$, 'P0001', null,
  'F3 · le motif ne se modifie pas hors révocation');

-- Isolation : John n'a plus que son dossier 1 (on révoque l'octroi F3 sur le dossier 2)
update public.matter_access set revoked_at = now()
  where matter_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-000000000001' and revoked_at is null;
select tests.authenticate_as('00000000-0000-0000-0000-000000000001', 'aal2');
select is((select string_agg(invoice_number, ',') from public.invoices), 'INV-JOHN', 'Isolation · John voit sa facture, pas celle de Jane');
select is((select count(*) from public.documents where display_name = 'Lease.pdf'), 0::bigint, 'Isolation · John ne voit pas les documents de Jane');
select is((select count(*) from public.document_requests) + (select count(*) from public.signature_requests)
          + (select count(*) from public.payments), 0::bigint,
  'Isolation · John ne voit ni demandes, ni signatures, ni paiements de Jane');
select tests.clear_authentication();

select tests.authenticate_as('00000000-0000-0000-0000-00000000000b', 'aal1', 'oauth');
select throws_ok($$ select * from public.list_audit_events() $$, '42501', null,
  'Le personnel non administrateur ne lit pas l''audit');
select tests.clear_authentication();

select * from finish();
rollback;
