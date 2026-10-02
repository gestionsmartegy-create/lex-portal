-- ============================================================================
-- Données fictives — LOCAL UNIQUEMENT (docs/mock-data.md, AGENTS.md §2.7)
-- ============================================================================
-- Chargé par `supabase db reset`. Jamais exécuté sur un projet distant.
-- * Tous les dossiers sont is_mock = true ; clients en @example.com.
-- * AUCUN mot de passe ici : `pnpm db:seed-passwords` les génère et les écrit
--   uniquement dans supabase/seed.local.md (ignoré par Git).
-- * Personnel simulé : comptes demo.* (provider azure simulé) — aucune adresse réelle.
-- * Dates relatives à now() pour que le tableau de bord reste cohérent.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Comptes (auth.users + auth.identities). Les jetons texte vides évitent les
-- erreurs de lecture de GoTrue sur des colonnes NULL.
-- --------------------------------------------------------------------------
with seed_users (id, email, provider, first_name, last_name) as (
  values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'john.doe@example.com',        'email', 'John',   'Doe'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'jane.roe@example.com',        'email', 'Jane',   'Roe'),
    ('a0000000-0000-4000-8000-0000000000b1'::uuid, 'demo.staff@lexcanadalaw.com', 'azure', 'Wilson', 'Saintelmy'),
    ('a0000000-0000-4000-8000-0000000000a1'::uuid, 'demo.admin@lexcanadalaw.com', 'azure', 'Admin',  'Démo')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
       jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider)),
       jsonb_build_object('first_name', first_name, 'last_name', last_name),
       now(), now(), '', '', '', ''
from seed_users;

-- Identité « email » pour permettre la connexion par mot de passe en local
-- (le personnel réel se connectera par Microsoft Entra ID).
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id::text like 'a0000000-%';

-- Profils créés par le trigger handle_new_user : on complète (rôle du serveur).
update public.profiles set status = 'active', client_number = '2026-0142' where email = 'john.doe@example.com';
update public.profiles set status = 'active', client_number = '2026-0098' where email = 'jane.roe@example.com';
update public.profiles set title = 'Me' where email = 'demo.staff@lexcanadalaw.com';
update public.profiles set role = 'firm_admin' where email = 'demo.admin@lexcanadalaw.com';

-- --------------------------------------------------------------------------
-- Organisation cliente
-- --------------------------------------------------------------------------
insert into public.organizations (id, name, type)
values ('b0000000-0000-4000-8000-000000000001', 'QVYON Technologies (fictif)', 'client_organization');
insert into public.organization_members (organization_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'owner');

-- --------------------------------------------------------------------------
-- Dossiers
-- --------------------------------------------------------------------------
insert into public.matters (id, display_number, title, practice_area, status, progress_percent,
                            responsible_staff_id, responsible_name, opened_at, closed_at, is_mock, last_synced_at)
values
  ('c0000000-0000-4000-8000-000000000142', 'LC-2026-0142', 'Permanent Residency Application', 'Immigration',
   'open', 65, 'a0000000-0000-4000-8000-0000000000b1', 'Me Wilson Saintelmy',
   (now() - interval '90 days')::date, null, true, now() - interval '5 minutes'),
  ('c0000000-0000-4000-8000-000000000098', 'LC-2026-0098', 'Business Incorporation — QVYON Technologies', 'Corporate',
   'closed', 100, 'a0000000-0000-4000-8000-0000000000b1', 'Me Wilson Saintelmy',
   (now() - interval '150 days')::date, (now() - interval '20 days')::date, true, now() - interval '5 minutes'),
  ('c0000000-0000-4000-8000-000000000115', 'LC-2026-0115', 'Commercial Lease Review', 'Real Estate',
   'on_hold', 30, 'a0000000-0000-4000-8000-0000000000b1', 'Me Wilson Saintelmy',
   (now() - interval '40 days')::date, null, true, now() - interval '5 minutes');

insert into public.matter_team (matter_id, user_id, role)
select m.id, 'a0000000-0000-4000-8000-0000000000b1', 'responsible' from public.matters m where m.is_mock;

insert into public.matter_access (matter_id, user_id, access_level, granted_by) values
  ('c0000000-0000-4000-8000-000000000142', 'a0000000-0000-4000-8000-000000000001', 'read_write', 'a0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-000000000115', 'a0000000-0000-4000-8000-000000000001', 'read',       'a0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-000000000098', 'a0000000-0000-4000-8000-000000000002', 'read',       'a0000000-0000-4000-8000-0000000000a1');

insert into public.matter_timeline_steps (matter_id, position, title, is_completed, completed_at) values
  ('c0000000-0000-4000-8000-000000000142', 1, 'Initial consultation',      true,  now() - interval '88 days'),
  ('c0000000-0000-4000-8000-000000000142', 2, 'Document collection',       true,  now() - interval '30 days'),
  ('c0000000-0000-4000-8000-000000000142', 3, 'IRCC application prepared', false, null),
  ('c0000000-0000-4000-8000-000000000142', 4, 'Submission to IRCC',        false, null),
  ('c0000000-0000-4000-8000-000000000142', 5, 'Decision',                  false, null);

-- --------------------------------------------------------------------------
-- Rendez-vous
-- --------------------------------------------------------------------------
insert into public.appointments (matter_id, title, starts_at, ends_at, location, meeting_url, with_staff_name, last_synced_at)
values ('c0000000-0000-4000-8000-000000000142', 'Consultation',
        date_trunc('day', now()) + interval '9 days 14 hours', date_trunc('day', now()) + interval '9 days 15 hours',
        'Microsoft Teams', 'https://example.com/meet', 'Me Wilson Saintelmy', now() - interval '5 minutes');

-- --------------------------------------------------------------------------
-- Documents (références SharePoint fictives ; la visibilité dépend du sous-dossier)
-- --------------------------------------------------------------------------
insert into public.documents (id, matter_id, provider, external_drive_id, external_item_id, folder, display_name,
                              status, scan_status, mime_type, size_bytes, uploaded_by, uploaded_at, last_synced_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-001',
   'signed', 'Engagement Agreement — Signed.pdf', 'signed', 'clean', 'application/pdf', 250880,
   'a0000000-0000-4000-8000-0000000000b1', now() - interval '30 days', now() - interval '5 minutes'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-002',
   'client_upload', 'Passport Copy — Certified.pdf', 'uploaded', 'clean', 'application/pdf', 1258291,
   'a0000000-0000-4000-8000-000000000001', now() - interval '33 days', now() - interval '5 minutes'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-003',
   'shared', 'IRCC Form IMM 5444.pdf', 'pending_signature', 'clean', 'application/pdf', 389120,
   'a0000000-0000-4000-8000-0000000000b1', now() - interval '36 days', now() - interval '5 minutes'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000098', 'sharepoint', 'mock-drive', 'mock-item-004',
   'signed', 'Certificate of Incorporation.pdf', 'signed', 'clean', 'application/pdf', 532480,
   'a0000000-0000-4000-8000-0000000000b1', now() - interval '140 days', now() - interval '5 minutes'),
  -- Contrôle de sécurité : ne doit JAMAIS apparaître côté client.
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-005',
   'internal', 'Note interne — stratégie.docx', 'in_review', 'clean',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 49152,
   'a0000000-0000-4000-8000-0000000000b1', now() - interval '41 days', now() - interval '5 minutes');

insert into public.document_requests (matter_id, requested_from, requested_by, title, description, due_date, status)
values ('c0000000-0000-4000-8000-000000000142', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1',
        'Proof of funds', 'Bank statements for the last 6 months.', (now() + interval '19 days')::date, 'pending');

insert into public.signature_requests (matter_id, document_id, signer_id, requested_by, provider, status, due_at, sent_at)
values ('c0000000-0000-4000-8000-000000000142', 'd0000000-0000-4000-8000-000000000003',
        'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 'mock', 'sent',
        now() + interval '11 days', now() - interval '2 hours');

-- --------------------------------------------------------------------------
-- Factures
-- --------------------------------------------------------------------------
insert into public.invoices (matter_id, invoice_number, issued_at, due_at, amount_total, balance_due, status, last_synced_at)
values
  ('c0000000-0000-4000-8000-000000000142', 'INV-2026-0089', (now() - interval '30 days')::date, (now() + interval '14 days')::date,
   1250.00, 1250.00, 'due', now() - interval '5 minutes'),
  ('c0000000-0000-4000-8000-000000000098', 'INV-2026-0072', (now() - interval '135 days')::date, (now() - interval '121 days')::date,
   3800.00, 0.00, 'paid', now() - interval '5 minutes');

-- --------------------------------------------------------------------------
-- Messagerie
-- --------------------------------------------------------------------------
insert into public.conversations (id, matter_id, scope, subject, created_by)
values ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000142', 'matter',
        'LC-2026-0142 — Questions', 'a0000000-0000-4000-8000-0000000000b1');
insert into public.conversation_participants (conversation_id, user_id, last_read_at)
values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day');

insert into public.messages (conversation_id, sender_id, body, created_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Thank you, I have uploaded the certified copy of my passport.', now() - interval '26 hours'),
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1',
   'Your application has been reviewed. I need you to sign the updated declaration form before we can proceed.',
   now() - interval '2 hours');

-- --------------------------------------------------------------------------
-- Notifications (John)
-- --------------------------------------------------------------------------
insert into public.notifications (user_id, type, priority, title, body, matter_id, reference_type, reference_id, action_url, read_at, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'signature_required', 'urgent', 'Signature required',
   'IRCC Form IMM 5444.pdf requires your electronic signature.', 'c0000000-0000-4000-8000-000000000142',
   'document', 'd0000000-0000-4000-8000-000000000003', '/portal/documents', null, now() - interval '2 hours'),
  ('a0000000-0000-4000-8000-000000000001', 'appointment_reminder', 'info', 'Consultation reminder',
   'Your consultation with Me Wilson Saintelmy is scheduled.', 'c0000000-0000-4000-8000-000000000142',
   'matter', 'c0000000-0000-4000-8000-000000000142', '/portal/appointments', null, now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000001', 'document_received', 'success', 'Document received',
   'Your passport copy has been certified and added to your file.', 'c0000000-0000-4000-8000-000000000142',
   'document', 'd0000000-0000-4000-8000-000000000002', '/portal/documents', now() - interval '30 days', now() - interval '33 days'),
  ('a0000000-0000-4000-8000-000000000001', 'invoice_issued', 'info', 'Invoice issued',
   'Invoice INV-2026-0089 has been issued.', 'c0000000-0000-4000-8000-000000000142',
   'matter', 'c0000000-0000-4000-8000-000000000142', '/portal/billing', now() - interval '29 days', now() - interval '30 days'),
  ('a0000000-0000-4000-8000-000000000002', 'matter_completed', 'success', 'Matter completed',
   'Business Incorporation — QVYON Technologies has been successfully completed.', 'c0000000-0000-4000-8000-000000000098',
   'matter', 'c0000000-0000-4000-8000-000000000098', '/portal/matters', null, now() - interval '20 days');
