-- Contrats, lot 1 (ADR 0032) : durcissement après revue de sécurité et décision du responsable du projet
-- (2026-10-18).
--  1. Un contrat lié à un dossier suit la règle du dossier : seuls l'équipe actuelle et le firm_admin y
--     accèdent. L'auteur retiré de l'équipe perd l'accès (décision du responsable du projet). L'auteur ne
--     garde un accès propre qu'aux contrats SANS dossier.
--  2. « Ce courriel est-il déjà un client ? » : limité aussi dans la base (60 par 10 minutes et par
--     personne), en plus de la limite de l'application.
--  3. Journal : modification de la fiche du client ou du titre (`contract.header_updated`), sans valeur.
--  4. Au plus 200 sections par contrat.

create or replace function private.can_access_contract(p_matter uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff() and (
           private.is_firm_admin()
        or (p_matter is null and p_created_by = auth.uid())
        or (p_matter is not null and private.is_on_matter_team(p_matter)))
$$;

create or replace function public.contract_client_email_known(p_email text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    return false;
  end if;
  if not public.rate_limit_hit('contract_email_db:' || auth.uid()::text, 60, 600) then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  return exists (select 1 from public.profiles p where lower(p.email) = lower(btrim(p_email)) and p.role = 'client');
end $$;
revoke all on function public.contract_client_email_known(text) from public, anon;
grant execute on function public.contract_client_email_known(text) to authenticated;

create or replace function private.audit_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform audit.record('contract.created', 'contract', new.id::text, new.matter_id,
                         jsonb_build_object('language', new.language, 'existing_client', new.client_id is not null));
  elsif new.status is distinct from old.status then
    perform audit.record('contract.' || new.status, 'contract', new.id::text, new.matter_id, '{}'::jsonb);
  elsif new.matter_id is distinct from old.matter_id then
    perform audit.record('contract.matter_linked', 'contract', new.id::text, new.matter_id, '{}'::jsonb);
  elsif (new.title, new.language, new.client_id, new.client_name, new.client_email, new.client_address,
         new.client_phone, new.client_language)
        is distinct from (old.title, old.language, old.client_id, old.client_name, old.client_email,
                          old.client_address, old.client_phone, old.client_language) then
    -- Seulement les NOMS des champs modifiés, jamais leurs valeurs.
    perform audit.record('contract.header_updated', 'contract', new.id::text, new.matter_id,
      jsonb_build_object('fields', to_jsonb(array_remove(array[
        case when new.title is distinct from old.title then 'title' end,
        case when new.language is distinct from old.language then 'language' end,
        case when new.client_id is distinct from old.client_id then 'client_id' end,
        case when new.client_name is distinct from old.client_name then 'client_name' end,
        case when new.client_email is distinct from old.client_email then 'client_email' end,
        case when new.client_address is distinct from old.client_address then 'client_address' end,
        case when new.client_phone is distinct from old.client_phone then 'client_phone' end,
        case when new.client_language is distinct from old.client_language then 'client_language' end
      ], null))));
  end if;
  return null;
end $$;

-- Compte hors RLS (fonction) : une sous-requête sur la même table dans la politique bouclerait.
create or replace function private.contract_section_count(p_contract uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.contract_sections s where s.contract_id = p_contract
$$;
revoke all on function private.contract_section_count(uuid) from public;
grant execute on function private.contract_section_count(uuid) to authenticated, service_role;

drop policy contract_sections_insert on public.contract_sections;
create policy contract_sections_insert on public.contract_sections for insert to authenticated
  with check (private.can_edit_contract(contract_id) and private.contract_section_count(contract_id) < 200);
