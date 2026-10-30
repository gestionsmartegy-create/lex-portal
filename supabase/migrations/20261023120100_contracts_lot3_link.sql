-- Contrats, lot 3 (ADR 0036), suite :
--  1. Client sans compte : une fois invité et son compte actif, l'envoi retrouve son compte d'après le
--     courriel de la fiche (compte client actif, visible de la personne qui envoie) et le lie au contrat.
--  2. Contrat accepté sans dossier : le firm_admin le rattache à un dossier (puis « Ouvrir le dossier »).
-- Règle : AUCUNE instruction entre set_config('lex.contract_flow', 'on') et (…, 'off') autre que l'UPDATE.

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
  v_client := v.client_id;
  if v_client is null and v.client_email is not null then
    select p.id into v_client from public.profiles p
     where lower(p.email) = lower(v.client_email) and p.role = 'client' and p.status = 'active'
       and private.can_see_profile(p.id)
     limit 1;
  end if;
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
  return v.validated_version;
end $$;

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
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set matter_id = p_matter where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  -- Le trigger journalise « contract.matter_linked ».
end $$;

revoke all on function public.contract_link_matter(uuid, uuid) from public, anon;
grant execute on function public.contract_link_matter(uuid, uuid) to authenticated;
