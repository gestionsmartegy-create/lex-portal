-- Assistant IA (ADR 0037) : contrôle des sections d'un gabarit proposé, y compris quand un champ manque
-- (une section sans titre ou sans contenu « doc » est refusée).
create or replace function public.contract_template_create_draft(p_name text, p_domain text, p_language text,
                                                                 p_sections jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_firm_admin() then
    raise exception 'firm_admin only' using errcode = '42501';
  end if;
  if p_language not in ('fr', 'en') or jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) not between 1 and 60 then
    raise exception 'invalid template' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_sections) e
              where coalesce(jsonb_typeof(e -> 'title'), '') <> 'string'
                 or length(e ->> 'title') > 200
                 or coalesce(jsonb_typeof(e -> 'body'), '') <> 'object'
                 or coalesce(e -> 'body' ->> 'type', '') <> 'doc'
                 or coalesce(jsonb_typeof(e -> 'body' -> 'content'), 'array') <> 'array'
                 or octet_length((e -> 'body')::text) > 200000) then
    raise exception 'invalid template' using errcode = '22023';
  end if;
  insert into public.contract_templates (name, description, domain, language, signing, status, needs_review, current_version)
  values (p_name, null, coalesce(p_domain, 'other'), p_language, 'clio', 'draft', true, 1)
  returning id into v_id;
  insert into public.contract_template_versions (template_id, version, sections, line_items)
  values (v_id, 1, p_sections, '[]'::jsonb);
  perform audit.record('contract_template.created', 'contract_templates', v_id::text, null,
                       jsonb_build_object('from_ai', true));
  return v_id;
end $$;
