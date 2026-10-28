-- Assistant IA (ADR 0037) : corrections de la revue de sécurité du 2026-10-28.
--  1. ai_reserve : verrou sur les réglages (deux demandes simultanées ne dépassent pas le plafond) ;
--     sorte « template » réservée au firm_admin ; les autres sortes exigent un contrat.
--  2. ai_complete : réservé au personnel ; un échec APRÈS l'appel garde au moins le coût de l'envoi,
--     et ces demandes comptent dans le total du mois.
--  3. contract_template_create_draft : forme de chaque section vérifiée par la base.

create or replace function private.ai_month_cost()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.cost_cents), 0) from private.ai_usage u
   where u.created_at >= date_trunc('month', now() at time zone 'America/Halifax') at time zone 'America/Halifax'
$$;

create or replace function public.ai_reserve(p_contract uuid, p_kind text, p_chars_in integer, p_mock boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare s public.ai_settings%rowtype; v_cost numeric; v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_kind = 'template' then
    if not private.is_firm_admin() then
      raise exception 'firm_admin only' using errcode = '42501';
    end if;
  elsif p_kind in ('draft', 'rephrase', 'simplify', 'translate') then
    if p_contract is null then
      raise exception 'contract required' using errcode = '22023';
    end if;
  else
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if p_contract is not null and not exists (select 1 from public.contracts c where c.id = p_contract
                                              and private.can_access_contract(c.matter_id, c.created_by)) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  -- Verrou : les réservations du cabinet passent une à une (le total du mois reste exact).
  select * into s from public.ai_settings where id for update;
  if not s.enabled then
    raise exception 'ai disabled' using errcode = '55000';
  end if;
  v_cost := round(greatest(p_chars_in, 0) / 1000.0 * s.cents_per_1k_chars, 4);
  if private.ai_month_cost() + v_cost > s.monthly_cap_cents then
    raise exception 'ai budget exceeded' using errcode = '54000';
  end if;
  insert into private.ai_usage (user_id, contract_id, kind, chars_in, cost_cents, mock)
  values (auth.uid(), p_contract, p_kind, least(greatest(p_chars_in, 0), 200000), v_cost, coalesce(p_mock, true))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ai_complete(p_usage uuid, p_chars_out integer, p_ok boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s public.ai_settings%rowtype; v_out integer := least(greatest(coalesce(p_chars_out, 0), 0), 200000);
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into s from public.ai_settings where id;
  update private.ai_usage u
     set chars_out = v_out,
         -- Réussite : envoi + réponse. Échec : au moins le coût de l'envoi (déjà estimé à la réservation).
         cost_cents = round((u.chars_in + case when p_ok then v_out else 0 end) / 1000.0 * s.cents_per_1k_chars, 4),
         status = case when p_ok then 'done' else 'failed' end
   where u.id = p_usage and u.user_id = auth.uid() and u.status = 'reserved';
end $$;

create or replace function public.ai_month_usage()
returns table (requests integer, cost_cents numeric, cap_cents integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from private.ai_usage u
           where u.created_at >= date_trunc('month', now() at time zone 'America/Halifax') at time zone 'America/Halifax'),
         private.ai_month_cost(),
         (select s.monthly_cap_cents from public.ai_settings s where s.id)
   where private.is_firm_admin()
$$;

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
  -- Chaque section : un titre texte (200 caractères au plus) et un contenu ProseMirror « doc ».
  if exists (select 1 from jsonb_array_elements(p_sections) e
              where jsonb_typeof(e -> 'title') <> 'string' or length(e ->> 'title') > 200
                 or jsonb_typeof(e -> 'body') <> 'object' or e -> 'body' ->> 'type' <> 'doc'
                 or (e -> 'body' ? 'content' and jsonb_typeof(e -> 'body' -> 'content') <> 'array')
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
