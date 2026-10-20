-- Contrats dans le portail client (ADR 0035) : corrections de la revue de sécurité du 2026-10-20.
--  1. Un contrat lié à un dossier ne s'envoie qu'à un client qui a un accès NON révoqué à ce dossier.
--  2. Le client ne voit et n'accepte un contrat lié à un dossier que tant qu'il a accès au dossier
--     (même règle que le dossier : accès retiré, contrat retiré du portail).
--  3. La version renvoyée au client est réduite : jamais `ai_assisted`, `matter_id` ni `client_id`.
-- Règle des fonctions ci-dessous : AUCUNE instruction entre set_config('lex.contract_flow', 'on') et
-- set_config(…, 'off') autre que l'UPDATE prévu (le garde-fou laisse passer la ligne pendant ce temps).

-- Le client voit ce contrat : le sien, envoyé, en session client, et accès au dossier s'il y en a un.
create or replace function private.client_sees_contract(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and private.is_client_session()
       and c.client_id = auth.uid()
       and c.status in ('sent', 'signed')
       and (c.matter_id is null or private.client_access_level(c.matter_id) is not null))
$$;
revoke all on function private.client_sees_contract(uuid) from public;
grant execute on function private.client_sees_contract(uuid) to authenticated;

-- 1 ------------------------------------------------------------------------------------------
create or replace function public.contract_send(p_contract uuid, p_mode text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_signing text; v_version int;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  -- Verrou tenu, brouillon ou relecture, accès au contrat (équipe actuelle du dossier, auteur, firm_admin).
  if not private.can_edit_contract(p_contract) then
    raise exception 'not editable' using errcode = '42501';
  end if;
  select * into v from public.contracts c where c.id = p_contract for update;
  if v.template_draft then
    raise exception 'template draft' using errcode = '23514';
  end if;
  if v.client_id is null or not exists (select 1 from public.profiles p
                                         where p.id = v.client_id and p.role = 'client' and p.status = 'active') then
    raise exception 'client account required' using errcode = '23514';
  end if;
  if v.matter_id is not null and not exists (select 1 from public.matter_access ma
                                              where ma.matter_id = v.matter_id and ma.user_id = v.client_id
                                                and ma.revoked_at is null) then
    raise exception 'client has no access to the matter' using errcode = '23514';
  end if;
  if p_mode is null or p_mode not in ('clio', 'portal') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  -- Le mode du modèle s'impose, sauf « au choix ».
  select t.signing into v_signing from public.contract_templates t where t.id = v.template_id;
  if v_signing in ('clio', 'portal') and v_signing <> p_mode then
    raise exception 'mode imposed by template' using errcode = '23514';
  end if;
  -- Version figée : c'est elle que le client lit.
  v_version := public.contract_save_version(p_contract, case v.language when 'fr' then 'Envoyée au client'
                                                                        else 'Sent to client' end);
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'sent', sent_at = now(), sent_by = auth.uid(), sent_version = v_version, signing_mode = p_mode,
         locked_by = null, locked_until = null
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  return v_version;
end $$;

-- 2 et 3 -------------------------------------------------------------------------------------
create or replace function public.client_contracts()
returns table (id uuid, title text, language text, status text, signing_mode text,
               sent_at timestamptz, viewed_at timestamptz, accepted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, (cv.snapshot ->> 'title'), c.language, c.status, c.signing_mode, c.sent_at, c.viewed_at, c.accepted_at
    from public.contracts c
    join public.contract_versions cv on cv.contract_id = c.id and cv.version = c.sent_version
   where c.client_id = auth.uid()
     and private.client_sees_contract(c.id)
   order by c.sent_at desc
   limit 100
$$;

create or replace function public.client_contract(p_contract uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', c.id, 'status', c.status, 'signing_mode', c.signing_mode, 'language', c.language,
           'sent_at', c.sent_at, 'viewed_at', c.viewed_at, 'accepted_at', c.accepted_at,
           'accepted_name', c.accepted_name, 'created_at', c.created_at, 'client_province', c.client_province,
           -- Version réduite : seulement ce qui est imprimé dans le contrat.
           'snapshot', jsonb_build_object(
             'title', cv.snapshot -> 'title',
             'client_name', cv.snapshot -> 'client_name',
             'client_email', cv.snapshot -> 'client_email',
             'client_address', cv.snapshot -> 'client_address',
             'client_phone', cv.snapshot -> 'client_phone',
             'sections', coalesce((select jsonb_agg(jsonb_build_object('position', s -> 'position', 'title', s -> 'title',
                                                                       'body', s -> 'body'))
                                     from jsonb_array_elements(cv.snapshot -> 'sections') s), '[]'::jsonb)),
           'matter', (select jsonb_build_object('number', m.display_number, 'title', m.title)
                        from public.matters m where m.id = c.matter_id),
           'lawyer', (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
                        from public.profiles p where p.id = coalesce(c.sent_by, c.created_by)),
           'lines', coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'pricing', l.pricing,
                                                                  'quantity', l.quantity::text,
                                                                  'unit_price', l.unit_price::text)
                                               order by l.position, l.created_at)
                                from public.contract_line_items l where l.contract_id = c.id), '[]'::jsonb),
           'rates', coalesce((select jsonb_agg(jsonb_build_object('tax_code', r.tax_code, 'rate', r.rate::text))
                                from (select distinct on (tr.tax_code) tr.tax_code, tr.rate
                                        from public.tax_rates tr
                                       where tr.province = c.client_province
                                         and tr.effective_from <= (c.created_at at time zone 'America/Halifax')::date
                                         and (tr.effective_to is null
                                              or tr.effective_to > (c.created_at at time zone 'America/Halifax')::date)
                                       order by tr.tax_code, tr.effective_from desc) r), '[]'::jsonb))
    from public.contracts c
    join public.contract_versions cv on cv.contract_id = c.id and cv.version = c.sent_version
   where c.id = p_contract
     and private.client_sees_contract(c.id)
$$;

create or replace function public.client_contract_viewed(p_contract uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_matter uuid;
begin
  if not private.client_sees_contract(p_contract) then
    return;
  end if;
  select c.matter_id into v_matter from public.contracts c where c.id = p_contract and c.viewed_at is null for update;
  if not found then
    return;
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set viewed_at = now() where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.viewed', 'contract', p_contract::text, v_matter, '{}'::jsonb);
end $$;

create or replace function public.client_contract_accept(p_contract uuid, p_name text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_name text := btrim(coalesce(p_name, ''));
begin
  -- Même réponse que « n'existe pas » pour un contrat qui n'est pas le sien (ou plus accessible).
  if not private.client_sees_contract(p_contract) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select * into v from public.contracts c where c.id = p_contract for update;
  if v.status <> 'sent' or v.signing_mode <> 'portal' then
    raise exception 'not acceptable' using errcode = '23514';
  end if;
  if length(v_name) < 2 or length(v_name) > 200 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'signed', accepted_at = now(), accepted_name = v_name, viewed_at = coalesce(c.viewed_at, now())
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  -- Le trigger journalise « contract.signed » ; on précise ici le mode (jamais le nom tapé).
  perform audit.record('contract.accepted', 'contract', p_contract::text, v.matter_id,
                       jsonb_build_object('mode', 'portal', 'version', v.sent_version));
end $$;
