-- Contrats, lot 3 (ADR 0036) : corrections de la revue de sécurité du 2026-10-21.
--  1. Contrat SANS dossier : validé par le firm_admin seulement (décision du 2026-10-21) ; avec dossier,
--     par un avocat de l'équipe (responsable, d'origine, collaborateur) ou le firm_admin.
--  2. Liaison du compte client retrouvé par courriel : aperçu avant l'envoi (contract_client_account)
--     et journal dédié (contract.client_linked, identifiants seulement).
--  3. contract_pdf : journalise seulement quand un PDF est réellement renvoyé.
--  4. Commentaires : la date de résolution ne se réécrit pas.
--  5. Rattachement à un dossier : le client du contrat doit avoir un accès actif à ce dossier.
--  6. Nouvelle version d'un contrat de démonstration : reste marquée « démonstration ».
-- Règle : AUCUNE instruction entre set_config('lex.contract_flow', 'on') et (…, 'off') autre que l'UPDATE.

-- 1 ------------------------------------------------------------------------------------------
create or replace function private.is_contract_lawyer(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and private.is_staff()
       and (private.is_firm_admin()
            or (c.matter_id is not null and exists (
                  select 1 from public.matter_team mt
                   where mt.matter_id = c.matter_id and mt.user_id = auth.uid()
                     and mt.role in ('responsible', 'originating', 'collaborator')))))
$$;

-- 2 ------------------------------------------------------------------------------------------
-- Compte client qui recevra le contrat (le lié, ou celui retrouvé par le courriel de la fiche),
-- pour l'afficher et le faire confirmer avant l'envoi. Équipe du contrat seulement.
create or replace function private.contract_recipient(p_contract uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(c.client_id, (
           select p.id from public.profiles p
            where c.client_email is not null and lower(p.email) = lower(c.client_email)
              and p.role = 'client' and p.status = 'active' and private.can_see_profile(p.id)
            limit 1))
    from public.contracts c where c.id = p_contract
$$;
revoke all on function private.contract_recipient(uuid) from public;
grant execute on function private.contract_recipient(uuid) to authenticated;

create or replace function public.contract_client_account(p_contract uuid)
returns table (id uuid, name text, email text, linked boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, c.client_id is not null
    from public.contracts c
    join public.profiles p on p.id = private.contract_recipient(c.id)
   where c.id = p_contract
     and private.can_access_contract(c.matter_id, c.created_by)
     and p.status = 'active' and p.role = 'client'
$$;

create or replace function public.contract_send(p_contract uuid, p_mode text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_signing text; v_client uuid;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  -- Tout membre de l'équipe (décision du 2026-10-20), sur un contrat VALIDÉ.
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status <> 'validated' or v.validated_version is null then
    raise exception 'not validated' using errcode = '23514';
  end if;
  v_client := private.contract_recipient(p_contract);
  if v_client is null or not exists (select 1 from public.profiles p
                                      where p.id = v_client and p.role = 'client' and p.status = 'active') then
    raise exception 'client account required' using errcode = '23514';
  end if;
  if v.matter_id is not null and not exists (select 1 from public.matter_access ma
                                              where ma.matter_id = v.matter_id and ma.user_id = v_client
                                                and ma.revoked_at is null) then
    raise exception 'client has no access to the matter' using errcode = '23514';
  end if;
  if p_mode is null or p_mode not in ('clio', 'portal') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  select t.signing into v_signing from public.contract_templates t where t.id = v.template_id;
  if v_signing in ('clio', 'portal') and v_signing <> p_mode then
    raise exception 'mode imposed by template' using errcode = '23514';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'sent', sent_at = now(), sent_by = auth.uid(), sent_version = v.validated_version,
         signing_mode = p_mode, client_id = v_client, locked_by = null, locked_until = null
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  if v.client_id is null then
    perform audit.record('contract.client_linked', 'contract', p_contract::text, v.matter_id,
                         jsonb_build_object('client_id', v_client, 'by_email', true));
  end if;
  return v.validated_version;
end $$;

-- 3 ------------------------------------------------------------------------------------------
create or replace function public.contract_pdf(p_contract uuid)
returns table (version int, sha256 text, pdf_base64 text)
language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_client boolean; v_version int; v_found boolean;
begin
  select * into v from public.contracts c where c.id = p_contract;
  if not found or (v.validated_version is null and v.sent_version is null) then
    return;
  end if;
  v_client := private.client_sees_contract(p_contract);
  if not v_client and not private.can_access_contract(v.matter_id, v.created_by) then
    return;
  end if;
  v_version := coalesce(case when v_client then v.sent_version end, v.validated_version, v.sent_version);
  select exists (select 1 from private.contract_pdfs p where p.contract_id = p_contract and p.version = v_version)
    into v_found;
  if not v_found then
    return;
  end if;
  perform audit.record('contract.pdf_downloaded', 'contract', p_contract::text, v.matter_id,
                       jsonb_build_object('by_client', v_client, 'version', v_version));
  return query
    select p.version, p.sha256, encode(p.pdf, 'base64')
      from private.contract_pdfs p
     where p.contract_id = p_contract and p.version = v_version;
end $$;

-- 4 ------------------------------------------------------------------------------------------
create or replace function private.guard_contract_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.resolved_at := null;
    new.resolved_by := null;
  elsif new.resolved_at is null then
    new.resolved_by := null;
  elsif old.resolved_at is not null then
    -- Déjà réglé : la date et l'auteur de la résolution ne changent pas.
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  else
    new.resolved_at := now();
    new.resolved_by := auth.uid();
  end if;
  return new;
end $$;

-- 5 ------------------------------------------------------------------------------------------
create or replace function public.contract_link_matter(p_contract uuid, p_matter uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype;
begin
  if not private.is_firm_admin() then
    raise exception 'firm_admin only' using errcode = '42501';
  end if;
  select * into v from public.contracts c where c.id = p_contract for update;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status <> 'signed' or v.matter_id is not null then
    raise exception 'not linkable' using errcode = '23514';
  end if;
  if not exists (select 1 from public.matters m where m.id = p_matter) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  -- Sinon le client perdrait la vue de son propre contrat accepté.
  if v.client_id is not null and not exists (select 1 from public.matter_access ma
                                              where ma.matter_id = p_matter and ma.user_id = v.client_id
                                                and ma.revoked_at is null) then
    raise exception 'client has no access to the matter' using errcode = '23514';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set matter_id = p_matter where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
end $$;

-- 6 ------------------------------------------------------------------------------------------
-- Garde-fou des contrats : pendant une transition faite par une fonction (lex.contract_flow), seul
-- l'auteur reste intouchable (la marque « démonstration » peut être reportée sur une nouvelle version).
create or replace function private.guard_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.is_mock := false;
    end if;
    new.status := 'draft';
    new.cancel_reason := null;
    new.sent_at := null; new.sent_by := null; new.sent_version := null; new.signing_mode := null;
    new.viewed_at := null; new.accepted_at := null; new.accepted_name := null;
    new.validated_at := null; new.validated_by := null; new.validated_version := null; new.pdf_sha256 := null;
    new.reminded_at := null; new.reminder_count := 0; new.declined_at := null; new.decline_reason := null;
    new.superseded_by := null;
    -- L'auteur tient le verrou dès la création (il remplit les sections tout de suite).
    new.locked_by := new.created_by;
    new.locked_until := now() + interval '5 minutes';
  else
    if new.created_by <> old.created_by then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    if coalesce(current_setting('lex.contract_flow', true), 'off') = 'on' then
      return new;
    end if;
    if new.is_mock <> old.is_mock then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    if (new.sent_at, new.sent_by, new.sent_version, new.signing_mode, new.viewed_at, new.accepted_at, new.accepted_name)
       is distinct from
       (old.sent_at, old.sent_by, old.sent_version, old.signing_mode, old.viewed_at, old.accepted_at, old.accepted_name) then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    -- Seul le verrou change (fonctions de verrou) : rien d'autre à vérifier.
    if (to_jsonb(new) - array['locked_by', 'locked_until', 'updated_at'])
       is not distinct from (to_jsonb(old) - array['locked_by', 'locked_until', 'updated_at']) then
      return new;
    end if;
    if auth.uid() is not null then
      if old.status not in ('draft', 'in_review') then
        raise exception 'contract not editable' using errcode = '23514';
      end if;
      if not (old.locked_by = auth.uid() and old.locked_until > now()) then
        raise exception 'contract locked' using errcode = '55006';
      end if;
      -- Validation, envoi et acceptation : fonctions dédiées. Ici : brouillon, relecture ou annulation.
      if new.status not in ('draft', 'in_review', 'cancelled') then
        raise exception 'invalid status' using errcode = '23514';
      end if;
    end if;
  end if;
  if new.status = 'cancelled' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'cancel reason required' using errcode = '23514';
    end if;
    new.locked_by := null;
    new.locked_until := null;
  else
    new.cancel_reason := null;
  end if;
  -- Client existant : un vrai client, visible de la personne (pas d'identifiant arbitraire).
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    if not exists (select 1 from public.profiles p where p.id = new.client_id and p.role = 'client')
       or (auth.uid() is not null and not private.can_see_profile(new.client_id)) then
      raise exception 'invalid client' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function public.contract_new_version(p_contract uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_new uuid; v_template uuid;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status not in ('sent', 'declined') or v.template_draft then
    raise exception 'not replaceable' using errcode = '23514';
  end if;
  select t.id into v_template from public.contract_templates t
   where t.id = v.template_id and t.status = 'published';
  insert into public.contracts (title, language, matter_id, client_id, client_name, client_email, client_address,
                                client_phone, client_language, client_province, template_id, template_version,
                                previous_id)
  values (v.title, v.language, v.matter_id, v.client_id, v.client_name, v.client_email, v.client_address,
          v.client_phone, v.client_language, v.client_province, v_template,
          case when v_template is null then null else v.template_version end, v.id)
  returning id into v_new;
  insert into public.contract_sections (contract_id, position, title, body, ai_assisted)
  select v_new, s.position, s.title, s.body, s.ai_assisted from public.contract_sections s where s.contract_id = v.id;
  insert into public.contract_line_items (contract_id, position, service_id, description, pricing, quantity, unit_price)
  select v_new, l.position, l.service_id, l.description, l.pricing, l.quantity, l.unit_price
    from public.contract_line_items l where l.contract_id = v.id;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set status = 'superseded', superseded_by = v_new where c.id = v.id;
  update public.contracts c set is_mock = v.is_mock where c.id = v_new;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.new_version', 'contract', v_new::text, v.matter_id,
                       jsonb_build_object('previous', v.id));
  return v_new;
end $$;

revoke all on function public.contract_client_account(uuid) from public, anon;
grant execute on function public.contract_client_account(uuid) to authenticated;
