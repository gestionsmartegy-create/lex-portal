-- ============================================================================
-- J2.1 — Durcissement après revue de sécurité indépendante (ADR 0009)
-- ============================================================================
-- E1  Droits du personnel conditionnés à une connexion Microsoft (amr oauth)
--     ou au MFA (aal2) ; mot de passe seulement pour les domaines de test.
-- E2  Session valide (compte actif + MFA client / auth personnel) exigée
--     partout, y compris messagerie générale, notifications, profil.
-- M1  Moindre privilège du personnel (participants, organisations, profils).
-- M2  action_url : chemin interne strict (pas de redirection ouverte).
-- M3  E-mail : synchronisation profil, domaine du personnel interdit aux clients.
-- F1  Notes et auteurs de révocation illisibles par le client.
-- F2  Identifiants externes (Clio, SharePoint) illisibles côté API.
-- F3  Auteur d'octroi / de révocation non falsifiable ; motif figé.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SESSIONS (E1, E2)
-- ----------------------------------------------------------------------------
-- Domaines autorisés à se connecter par mot de passe (comptes fictifs locaux
-- uniquement : ajoutés par supabase/seed.sql). En production : aucun.
alter table private.staff_email_domains
  add column allow_password boolean not null default false;

-- Authentification acceptable pour le personnel : Microsoft Entra ID (OAuth),
-- ou MFA Supabase, ou domaine explicitement autorisé au mot de passe.
create or replace function private.staff_auth_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() -> 'amr' @> '[{"method": "oauth"}]'::jsonb, false)
      or private.has_mfa()
      or exists (
        select 1 from public.profiles p
        join private.staff_email_domains d on d.domain = lower(split_part(p.email, '@', 2))
        where p.id = auth.uid() and d.allow_password
      )
$$;

-- Rôle de l'utilisateur courant, UNIQUEMENT si la session est valide :
-- compte actif ET (client : aal2 | personnel : staff_auth_ok()).
-- Tous les helpers (is_staff, is_firm_admin, client_access_level, can_read_matter…)
-- en héritent.
create or replace function private.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and case when p.role = 'client' then private.has_mfa() else private.staff_auth_ok() end
$$;

create or replace function private.session_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_app_role() is not null
$$;

-- Compte actif, sans exigence de MFA : réservé à la lecture de son propre profil
-- (écran d'enrôlement MFA).
create or replace function private.account_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function private.is_conversation_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_ok() and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id = auth.uid()
  )
$$;

-- Visibilité d'une conversation : session valide, dossier encore lisible (si
-- fil de dossier) et (participant OU personnel du dossier).
create or replace function private.can_see_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (c.matter_id is null or private.can_read_matter(c.matter_id))
      and (private.is_conversation_participant(c.id)
           or (c.matter_id is not null and private.is_staff()))
  )
$$;

-- Le personnel partage-t-il un dossier ACTIF avec cet utilisateur ?
create or replace function private.staff_shares_client(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff() and exists (
    select 1 from public.matter_access ma
    join public.matter_team mt on mt.matter_id = ma.matter_id and mt.user_id = auth.uid()
    where ma.user_id = p_user and ma.revoked_at is null
  )
$$;

create or replace function private.can_see_organization(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_firm_admin()
      or (private.session_ok() and exists (
            select 1 from public.organization_members om
            where om.organization_id = p_org and om.user_id = auth.uid()))
      or exists (
            select 1 from public.organization_members om
            where om.organization_id = p_org and private.staff_shares_client(om.user_id))
$$;

-- M1 : profils — soi-même (compte actif), firm_admin, personnel (collègues +
-- clients d'un dossier ACTIF de son équipe), client (personnel de ses dossiers).
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_user = auth.uid() and private.account_active())
      or private.is_firm_admin()
      or (private.is_staff() and (
            exists (select 1 from public.profiles p where p.id = p_user and p.role in ('staff', 'firm_admin'))
         or private.staff_shares_client(p_user)))
      or exists (select 1 from public.matter_team mt
                 where mt.user_id = p_user and private.client_access_level(mt.matter_id) is not null)
$$;

revoke all on function private.staff_auth_ok(), private.session_ok(), private.account_active(),
  private.can_see_conversation(uuid), private.staff_shares_client(uuid), private.can_see_organization(uuid)
  from public;
grant execute on function private.staff_auth_ok(), private.session_ok(), private.account_active(),
  private.can_see_conversation(uuid), private.staff_shares_client(uuid), private.can_see_organization(uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. POLITIQUES MODIFIÉES (E2, M1)
-- ----------------------------------------------------------------------------
drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.session_ok()) with check (id = auth.uid() and private.session_ok());

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (private.can_see_organization(id));

drop policy organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members for select to authenticated
  using (private.is_firm_admin()
         or (user_id = auth.uid() and private.session_ok())
         or private.staff_shares_client(user_id));

drop policy external_accounts_select on public.external_accounts;
create policy external_accounts_select on public.external_accounts for select to authenticated
  using ((user_id = auth.uid() and private.session_ok()) or private.is_firm_admin());

drop policy matter_access_select on public.matter_access;
create policy matter_access_select on public.matter_access for select to authenticated
  using ((user_id = auth.uid() and private.session_ok())
         or private.is_firm_admin() or private.is_on_matter_team(matter_id));

drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (private.can_see_conversation(id));

drop policy participants_select on public.conversation_participants;
create policy participants_select on public.conversation_participants for select to authenticated
  using (private.can_see_conversation(conversation_id));

drop policy participants_update_self on public.conversation_participants;
create policy participants_update_self on public.conversation_participants for update to authenticated
  using (user_id = auth.uid() and private.can_see_conversation(conversation_id))
  with check (user_id = auth.uid() and private.can_see_conversation(conversation_id));

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id)
         and private.can_see_conversation(conversation_id));

drop policy notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid() and private.session_ok()
         and (matter_id is null or private.can_read_matter(matter_id)));

drop policy notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid() and private.session_ok())
  with check (user_id = auth.uid() and private.session_ok());

drop policy notification_prefs_own on public.notification_preferences;
create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid() and private.session_ok())
  with check (user_id = auth.uid() and private.session_ok());

-- ----------------------------------------------------------------------------
-- 3. REDIRECTION OUVERTE (M2)
-- ----------------------------------------------------------------------------
-- Chemin interne : « / » suivi d'un caractère sûr (jamais « // » ni « /\ »),
-- puis segments et chaîne de requête restreints.
alter table public.notifications drop constraint notifications_action_url_check;
alter table public.notifications add constraint notifications_action_url_check
  check (action_url is null
         or action_url ~ '^/([A-Za-z0-9_-][A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&%._-]*)?$');

-- ----------------------------------------------------------------------------
-- 4. E-MAIL (M3)
-- ----------------------------------------------------------------------------
-- Changement d'e-mail (après confirmation par Supabase Auth) : le profil suit ;
-- un compte client ne peut pas prendre une adresse d'un domaine du personnel.
create or replace function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    if exists (select 1 from private.staff_email_domains d
               where d.domain = lower(split_part(new.email, '@', 2)))
       and coalesce((select p.role from public.profiles p where p.id = new.id), 'client') = 'client' then
      raise exception 'Adresse réservée au personnel du cabinet';
    end if;
    update public.profiles set email = lower(new.email) where id = new.id;
    perform audit.record('profile.email_changed', 'profile', new.id::text, null, '{}', new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_profile_email();

-- ----------------------------------------------------------------------------
-- 5. AUTEURS NON FALSIFIABLES (F3)
-- ----------------------------------------------------------------------------
create or replace function private.guard_matter_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user_session boolean := coalesce(auth.role(), '') = 'authenticated';
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'client') then
      raise exception 'matter_access est réservé aux comptes clients';
    end if;
    -- Session utilisateur : l'auteur est TOUJOURS l'utilisateur connecté.
    new.granted_by := case when v_user_session then auth.uid() else coalesce(new.granted_by, auth.uid()) end;
    new.granted_at := now();
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoke_reason := null;
    return new;
  end if;

  if old.revoked_at is not null then
    raise exception 'Un accès révoqué ne peut pas être modifié (créer un nouvel octroi)';
  end if;
  if (new.matter_id, new.user_id, new.access_level, new.granted_by, new.granted_at)
     is distinct from (old.matter_id, old.user_id, old.access_level, old.granted_by, old.granted_at) then
    raise exception 'Seule la révocation est autorisée sur matter_access';
  end if;
  if new.revoked_at is null then
    -- Pas de révocation : rien d'autre n'est modifiable (motif compris).
    if (new.revoked_by, new.revoke_reason) is distinct from (old.revoked_by, old.revoke_reason) then
      raise exception 'Le motif et l''auteur ne se fixent qu''au moment de la révocation';
    end if;
    return new;
  end if;
  new.revoked_at := now();
  new.revoked_by := case when v_user_session then auth.uid() else coalesce(new.revoked_by, auth.uid()) end;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 6. LECTURE PAR COLONNE (F1, F2)
-- ----------------------------------------------------------------------------
-- Les colonnes internes ne sont plus lisibles par l'API utilisateur. Le serveur
-- les lit avec service_role, APRÈS avoir vérifié l'accès avec la session de
-- l'utilisateur (ADR 0009). Toujours sélectionner des colonnes explicites.
revoke select on public.matter_access, public.documents, public.matters, public.invoices from authenticated;

grant select (id, matter_id, user_id, access_level, granted_at, revoked_at)
  on public.matter_access to authenticated;

grant select (id, matter_id, provider, folder, display_name, category, status, scan_status,
              mime_type, size_bytes, uploaded_by, uploaded_at, deleted_at, last_synced_at,
              created_at, updated_at)
  on public.documents to authenticated;

grant select (id, display_number, title, description, practice_area, status, progress_percent,
              responsible_staff_id, responsible_name, opened_at, closed_at, is_mock,
              last_synced_at, purged_at, created_at, updated_at)
  on public.matters to authenticated;

grant select (id, matter_id, invoice_number, issued_at, due_at, amount_total, balance_due,
              currency, status, last_synced_at, created_at, updated_at)
  on public.invoices to authenticated;

-- Historique complet des accès d'un dossier (motifs, auteurs) : firm_admin et équipe.
create or replace function public.list_matter_access(p_matter uuid)
returns setof public.matter_access
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_firm_admin() or private.is_on_matter_team(p_matter)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select * from public.matter_access ma where ma.matter_id = p_matter order by ma.granted_at desc;
end $$;
revoke all on function public.list_matter_access(uuid) from public, anon;
grant execute on function public.list_matter_access(uuid) to authenticated;
