-- ============================================================================
-- J2.1 bis — Suite de la contre-revue (ADR 0009, addendum)
-- ============================================================================
-- E1 (reste) : le chemin « aal2 » permettait à quiconque contrôle la boîte d'un
-- membre du personnel de faire « mot de passe oublié », d'enrôler lui-même un
-- TOTP, puis d'obtenir les droits du personnel SANS Microsoft. Le MFA du
-- personnel est celui d'Entra ID : seule une session Microsoft (amr oauth,
-- fournisseur azure) donne des droits. Exception : domaines .test (local).
-- F2 (reste) : derniers identifiants externes masqués à l'API utilisateur.
-- ============================================================================

create or replace function private.staff_auth_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select (
           coalesce(auth.jwt() -> 'amr' @> '[{"method": "oauth"}]'::jsonb, false)
           -- Identité Microsoft liée au compte (provider initial, ou ajoutée par liaison :
           -- cas d'un compte pré-créé par le firm_admin). Aucun autre fournisseur OAuth
           -- ne doit être activé dans Supabase Auth (ADR 0009).
           and (coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'azure'
                or coalesce(auth.jwt() -> 'app_metadata' -> 'providers' ? 'azure', false))
         )
      or exists (
        select 1 from public.profiles p
        join private.staff_email_domains d on d.domain = lower(split_part(p.email, '@', 2))
        where p.id = auth.uid() and d.allow_password
      )
$$;

-- Le mot de passe n'est autorisable QUE pour un domaine de test réservé (RFC 2606),
-- jamais pour le vrai domaine du cabinet, même par erreur dans une migration future.
alter table private.staff_email_domains
  add constraint staff_email_domains_password_only_test
  check (not allow_password or domain like '%.test');

-- F2 : identifiants de fournisseurs externes illisibles par l'API utilisateur
-- (lus par le serveur avec service_role après contrôle d'accès, ADR 0009).
revoke select on public.signature_requests, public.payments, public.appointments,
                 public.organizations, public.external_accounts from authenticated;

grant select (id, matter_id, document_id, signer_id, requested_by, provider, status,
              due_at, sent_at, viewed_at, signed_at, created_at, updated_at)
  on public.signature_requests to authenticated;

grant select (id, invoice_id, payer_id, provider, amount, currency, status, failure_code,
              succeeded_at, created_at, updated_at)
  on public.payments to authenticated;

grant select (id, matter_id, title, description, starts_at, ends_at, timezone, location,
              meeting_url, with_staff_name, status, last_synced_at, created_at, updated_at)
  on public.appointments to authenticated;

grant select (id, name, type, created_at, updated_at)
  on public.organizations to authenticated;

grant select (id, user_id, provider, external_region, created_at)
  on public.external_accounts to authenticated;
