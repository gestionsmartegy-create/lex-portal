-- ============================================================================
-- Données de DÉMONSTRATION pour la PRÉPRODUCTION (ADR 0013)
-- ============================================================================
-- À exécuter UNE fois dans l'éditeur SQL du projet Supabase de préproduction,
-- APRÈS `supabase db push`. Contrairement à supabase/seed.sql (local) :
--   * AUCUN compte (ni client ni personnel), AUCUN domaine *.test ;
--   * dossiers is_mock = true, affichés avec le badge « Données de démonstration » ;
--   * aucune donnée réelle. Le firm_admin invite un client DE TEST sur ces dossiers.
-- Idempotent : relançable sans doublon.
-- ============================================================================
begin;

insert into public.matters (id, display_number, title, practice_area, status, progress_percent,
                            responsible_name, opened_at, closed_at, is_mock, last_synced_at)
values
  ('c0000000-0000-4000-8000-000000000142', 'LC-2026-0142', 'Permanent Residency Application', 'Immigration',
   'open', 65, 'Me Wilson Saintelmy', (now() - interval '90 days')::date, null, true, now()),
  ('c0000000-0000-4000-8000-000000000098', 'LC-2026-0098', 'Business Incorporation — Demo Technologies', 'Corporate',
   'closed', 100, 'Me Wilson Saintelmy', (now() - interval '150 days')::date, (now() - interval '20 days')::date, true, now()),
  ('c0000000-0000-4000-8000-000000000115', 'LC-2026-0115', 'Commercial Lease Review', 'Real Estate',
   'on_hold', 30, 'Me Wilson Saintelmy', (now() - interval '40 days')::date, null, true, now())
on conflict (id) do nothing;

insert into public.matter_timeline_steps (matter_id, position, title, is_completed, completed_at)
select 'c0000000-0000-4000-8000-000000000142', s.position, s.title, s.done, s.at
from (values (1, 'Initial consultation', true, now() - interval '88 days'),
             (2, 'Document collection', true, now() - interval '30 days'),
             (3, 'IRCC application prepared', false, null::timestamptz),
             (4, 'Submission to IRCC', false, null),
             (5, 'Decision', false, null)) as s(position, title, done, at)
where not exists (select 1 from public.matter_timeline_steps t
                  where t.matter_id = 'c0000000-0000-4000-8000-000000000142');

insert into public.appointments (matter_id, title, starts_at, ends_at, location, meeting_url, with_staff_name, last_synced_at)
select 'c0000000-0000-4000-8000-000000000142', 'Consultation',
       date_trunc('day', now()) + interval '9 days 14 hours', date_trunc('day', now()) + interval '9 days 15 hours',
       'Microsoft Teams', 'https://example.com/meet', 'Me Wilson Saintelmy', now()
where not exists (select 1 from public.appointments a where a.matter_id = 'c0000000-0000-4000-8000-000000000142');

insert into public.documents (id, matter_id, provider, external_drive_id, external_item_id, folder, display_name,
                              status, scan_status, mime_type, size_bytes, uploaded_at, last_synced_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-001',
   'signed', 'Engagement Agreement — Signed.pdf', 'signed', 'clean', 'application/pdf', 250880, now() - interval '30 days', now()),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-003',
   'shared', 'IRCC Form IMM 5444.pdf', 'pending_signature', 'clean', 'application/pdf', 389120, now() - interval '36 days', now()),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000098', 'sharepoint', 'mock-drive', 'mock-item-004',
   'signed', 'Certificate of Incorporation.pdf', 'signed', 'clean', 'application/pdf', 532480, now() - interval '140 days', now()),
  -- Contrôle de sécurité : ne doit JAMAIS apparaître côté client.
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000142', 'sharepoint', 'mock-drive', 'mock-item-005',
   'internal', 'Note interne — stratégie.docx', 'in_review', 'clean',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 49152, now() - interval '41 days', now())
on conflict (id) do nothing;

insert into public.invoices (matter_id, invoice_number, issued_at, due_at, amount_total, balance_due, status, last_synced_at)
select i.matter_id, i.invoice_number, i.issued_at, i.due_at, i.amount_total, i.balance_due, i.status::public.invoice_status, now()
from (values
  ('c0000000-0000-4000-8000-000000000142'::uuid, 'INV-2026-0089', (now() - interval '30 days')::date, (now() + interval '14 days')::date,
   1250.00, 1250.00, 'due'),
  ('c0000000-0000-4000-8000-000000000098'::uuid, 'INV-2026-0072', (now() - interval '135 days')::date, (now() - interval '121 days')::date,
   3800.00, 0.00, 'paid')) as i(matter_id, invoice_number, issued_at, due_at, amount_total, balance_due, status)
where not exists (select 1 from public.invoices x where x.invoice_number = i.invoice_number);

commit;
