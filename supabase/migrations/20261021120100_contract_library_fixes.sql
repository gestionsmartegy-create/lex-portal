-- Contrats, lot 2 (ADR 0034) : corrections après la QA et la revue de sécurité du 2026-10-19.
-- 1. « Enregistrer comme modèle » crée un BROUILLON (version 1), à relire puis publier.
-- 2. Un modèle n'entre ni ne sort du brouillon par un simple UPDATE : seule contract_template_publish
--    le publie (nouvelle version, needs_review retiré).
-- 3. Enregistrement atomique du tableau des services d'un contrat (remplacement en une transaction).

-- 1 ------------------------------------------------------------------------------------------
create or replace function public.contract_template_from_contract(p_contract uuid, p_name text, p_domain text,
                                                                  p_signing text, p_description text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v public.contracts%rowtype;
begin
  if not private.is_firm_admin() then
    raise exception 'firm_admin only' using errcode = '42501';
  end if;
  select * into v from public.contracts c where c.id = p_contract;
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  insert into public.contract_templates (name, description, domain, language, signing, status, current_version)
  values (p_name, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_domain, 'other'), v.language,
          coalesce(p_signing, 'clio'), 'draft', 1)
  returning id into v_id;
  insert into public.contract_template_versions (template_id, version, sections, line_items)
  select v_id, 1, s.sections, s.line_items from private.contract_snapshot(p_contract) s;
  perform audit.record('contract_template.created', 'contract_templates', v_id::text, null,
                       jsonb_build_object('from_contract', p_contract));
  return v_id;
end $$;

-- 2 ------------------------------------------------------------------------------------------
create or replace function private.guard_contract_template_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and 'draft' in (old.status, new.status)
     and coalesce(current_setting('lex.template_publish', true), 'off') <> 'on' then
    raise exception 'template status change requires publication' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_contract_template_status() from public;
create trigger guard_contract_template_status before update of status on public.contract_templates
  for each row execute function private.guard_contract_template_status();

create or replace function public.contract_template_publish(p_contract uuid)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_version int;
begin
  if not private.is_firm_admin() then
    raise exception 'firm_admin only' using errcode = '42501';
  end if;
  select * into v from public.contracts c where c.id = p_contract and c.template_draft;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select t.current_version + 1 into v_version from public.contract_templates t where t.id = v.template_id for update;
  insert into public.contract_template_versions (template_id, version, sections, line_items)
  select v.template_id, v_version, s.sections, s.line_items from private.contract_snapshot(p_contract) s;
  -- Seule cette fonction fait sortir un modèle du brouillon (guard_contract_template_status).
  perform set_config('lex.template_publish', 'on', true);
  update public.contract_templates t
     set current_version = v_version, status = 'published', needs_review = false
   where t.id = v.template_id;
  perform set_config('lex.template_publish', 'off', true);
  -- Le brouillon a servi : il est clos.
  update public.contracts c set status = 'cancelled', cancel_reason = 'Publié comme version ' || v_version
   where c.id = p_contract;
  perform audit.record('contract_template.published', 'contract_templates', v.template_id::text, null,
                       jsonb_build_object('version', v_version));
  return v_version;
end $$;

-- 3 ------------------------------------------------------------------------------------------
-- Security invoker : la RLS de contract_line_items (verrou tenu, au plus 100 lignes) s'applique ;
-- toute erreur annule l'ensemble, l'ancien tableau reste en place.
create or replace function public.contract_replace_lines(p_contract uuid, p_lines jsonb)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'invalid lines' using errcode = '22023';
  end if;
  delete from public.contract_line_items l where l.contract_id = p_contract;
  insert into public.contract_line_items (contract_id, position, description, pricing, quantity, unit_price, service_id)
  select p_contract, (e.ord - 1)::int, e.item ->> 'description', e.item ->> 'pricing',
         (e.item ->> 'quantity')::numeric, (e.item ->> 'unit_price')::numeric,
         nullif(e.item ->> 'service_id', '')::uuid
    from jsonb_array_elements(p_lines) with ordinality as e(item, ord);
end $$;
revoke all on function public.contract_replace_lines(uuid, jsonb) from public, anon;
grant execute on function public.contract_replace_lines(uuid, jsonb) to authenticated;
