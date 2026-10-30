-- Assistant IA, garde-fous (ADR 0037, stories F12 à F14).
--  1. public.ai_settings (une seule ligne) : activé ou non, plafond mensuel (en cents), prix estimé par
--     millier de caractères. Lecture : personnel ; écriture : firm_admin. Journalisé.
--  2. private.ai_usage : chaque demande (qui, quel contrat, quelle sorte, nombre de caractères, coût
--     estimé). JAMAIS le texte envoyé ni la réponse.
--  3. public.ai_reserve / public.ai_complete : réservation AVANT l'appel (refus si désactivé ou si le
--     plafond du mois est atteint), puis coût final après la réponse. Coût calculé en numeric par la base.
--  4. public.ai_month_usage : consommation du mois (firm_admin).
--  5. public.contract_template_create_draft : gabarit proposé par l'IA, créé en BROUILLON « à faire
--     valider » ; seul le firm_admin le publie ensuite (contract_template_publish).

-- 1 ------------------------------------------------------------------------------------------
create table public.ai_settings (
  id                   boolean primary key default true check (id),
  enabled              boolean not null default true,
  monthly_cap_cents    integer not null default 5000 check (monthly_cap_cents between 0 and 10000000),
  cents_per_1k_chars   numeric(8, 4) not null default 0.2 check (cents_per_1k_chars >= 0 and cents_per_1k_chars < 1000),
  updated_by           uuid references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now()
);
insert into public.ai_settings (id) values (true);
alter table public.ai_settings enable row level security;
create policy ai_settings_select on public.ai_settings for select to authenticated using (private.is_staff());
create policy ai_settings_update on public.ai_settings for update to authenticated
  using (private.is_firm_admin()) with check (private.is_firm_admin());
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
grant update (enabled, monthly_cap_cents, cents_per_1k_chars) on public.ai_settings to authenticated;

create or replace function private.guard_ai_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  perform audit.record('ai.settings_updated', 'ai_settings', null, null,
                       jsonb_build_object('enabled', new.enabled, 'monthly_cap_cents', new.monthly_cap_cents,
                                          'cents_per_1k_chars', new.cents_per_1k_chars));
  return new;
end $$;
revoke all on function private.guard_ai_settings() from public;
create trigger ai_settings_guard before update on public.ai_settings
  for each row execute function private.guard_ai_settings();

-- 2 ------------------------------------------------------------------------------------------
create table private.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  kind        text not null check (kind in ('draft', 'rephrase', 'simplify', 'translate', 'template')),
  chars_in    integer not null check (chars_in between 0 and 200000),
  chars_out   integer check (chars_out is null or chars_out between 0 and 200000),
  cost_cents  numeric(12, 4) not null default 0 check (cost_cents >= 0),
  mock        boolean not null default true,
  status      text not null default 'reserved' check (status in ('reserved', 'done', 'failed')),
  created_at  timestamptz not null default now()
);
create index ai_usage_month_idx on private.ai_usage (created_at);
alter table private.ai_usage enable row level security;

create or replace function private.ai_month_cost()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.cost_cents), 0) from private.ai_usage u
   where u.created_at >= date_trunc('month', now() at time zone 'America/Halifax') at time zone 'America/Halifax'
     and u.status <> 'failed'
$$;
revoke all on function private.ai_month_cost() from public;

-- 3 ------------------------------------------------------------------------------------------
-- Réservation : personnel seulement ; refus « disabled » (55000) ou « budget » (54000).
create or replace function public.ai_reserve(p_contract uuid, p_kind text, p_chars_in integer, p_mock boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare s public.ai_settings%rowtype; v_cost numeric; v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_contract is not null and not exists (select 1 from public.contracts c where c.id = p_contract
                                              and private.can_access_contract(c.matter_id, c.created_by)) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select * into s from public.ai_settings where id;
  if not s.enabled then
    raise exception 'ai disabled' using errcode = '55000';
  end if;
  -- Estimation de l'aller (le retour est compté à la fin) : on refuse si le mois est déjà au plafond.
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
declare s public.ai_settings%rowtype;
begin
  select * into s from public.ai_settings where id;
  update private.ai_usage u
     set chars_out = least(greatest(coalesce(p_chars_out, 0), 0), 200000),
         cost_cents = case when p_ok then round((u.chars_in + least(greatest(coalesce(p_chars_out, 0), 0), 200000))
                                                 / 1000.0 * s.cents_per_1k_chars, 4) else 0 end,
         status = case when p_ok then 'done' else 'failed' end
   where u.id = p_usage and u.user_id = auth.uid() and u.status = 'reserved';
end $$;

-- 4 ------------------------------------------------------------------------------------------
create or replace function public.ai_month_usage()
returns table (requests integer, cost_cents numeric, cap_cents integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from private.ai_usage u
           where u.created_at >= date_trunc('month', now() at time zone 'America/Halifax') at time zone 'America/Halifax'
             and u.status <> 'failed'),
         private.ai_month_cost(),
         (select s.monthly_cap_cents from public.ai_settings s where s.id)
   where private.is_firm_admin()
$$;

-- 5 ------------------------------------------------------------------------------------------
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
  insert into public.contract_templates (name, description, domain, language, signing, status, needs_review, current_version)
  values (p_name, null, coalesce(p_domain, 'other'), p_language, 'clio', 'draft', true, 1)
  returning id into v_id;
  insert into public.contract_template_versions (template_id, version, sections, line_items)
  values (v_id, 1, p_sections, '[]'::jsonb);
  perform audit.record('contract_template.created', 'contract_templates', v_id::text, null,
                       jsonb_build_object('from_ai', true));
  return v_id;
end $$;

revoke all on function public.ai_reserve(uuid, text, integer, boolean), public.ai_complete(uuid, integer, boolean),
  public.ai_month_usage(), public.contract_template_create_draft(text, text, text, jsonb) from public, anon;
grant execute on function public.ai_reserve(uuid, text, integer, boolean), public.ai_complete(uuid, integer, boolean),
  public.ai_month_usage(), public.contract_template_create_draft(text, text, text, jsonb) to authenticated;
