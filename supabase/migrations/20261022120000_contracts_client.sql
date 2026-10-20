-- Contrats, lot 3 (partie « portail client », ADR 0035) et avis de changement des dates de cour.
--  1. Types de notification « contract_sent » et « court_date_changed ».
--  2. contracts : envoi (version figée, mode de signature), consultation et acceptation par le client.
--     Colonnes écrites seulement par les fonctions ci-dessous (aucun droit de mise à jour par colonne).
--  3. public.contract_send : tout membre de l'équipe (ou l'auteur d'un contrat sans dossier, ou le
--     firm_admin) qui tient le verrou envoie au client existant lié (décision du 2026-10-20).
--  4. Le client ne lit JAMAIS public.contracts : public.client_contracts / public.client_contract
--     renvoient seulement ses contrats envoyés, la version figée à l'envoi, en session client (aal2).
--  5. public.client_contract_accept : acceptation dans le portail (nom tapé + date), mode « portal » seulement.

alter type public.notification_type add value if not exists 'contract_sent';
alter type public.notification_type add value if not exists 'court_date_changed';

-- 2 ------------------------------------------------------------------------------------------
alter table public.contracts
  add column sent_at       timestamptz,
  add column sent_by       uuid references public.profiles(id) on delete set null,
  add column sent_version  int check (sent_version is null or sent_version >= 1),
  add column signing_mode  text check (signing_mode is null or signing_mode in ('clio', 'portal')),
  add column viewed_at     timestamptz,
  add column accepted_at   timestamptz,
  add column accepted_name text check (accepted_name is null
                                       or (length(accepted_name) between 2 and 200 and accepted_name !~ '[[:cntrl:]]'));

-- Garde-fou des contrats : inchangé, sauf les transitions faites par les fonctions d'envoi et
-- d'acceptation (indicateur de transaction, jamais réglable par l'API).
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
    -- L'auteur tient le verrou dès la création (il remplit les sections tout de suite).
    new.locked_by := new.created_by;
    new.locked_until := now() + interval '5 minutes';
  else
    if new.created_by <> old.created_by or new.is_mock <> old.is_mock then
      raise exception 'immutable column' using errcode = '23514';
    end if;
    if coalesce(current_setting('lex.contract_flow', true), 'off') = 'on' then
      return new;
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
      -- Envoi et acceptation : fonctions dédiées. Ici : brouillon, relecture ou annulation.
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

-- 3 ------------------------------------------------------------------------------------------
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

-- 4 ------------------------------------------------------------------------------------------
create or replace function private.is_client_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = 'client', false)
$$;
revoke all on function private.is_client_session() from public;
grant execute on function private.is_client_session() to authenticated;

create or replace function public.client_contracts()
returns table (id uuid, title text, language text, status text, signing_mode text,
               sent_at timestamptz, viewed_at timestamptz, accepted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, (cv.snapshot ->> 'title'), c.language, c.status, c.signing_mode, c.sent_at, c.viewed_at, c.accepted_at
    from public.contracts c
    join public.contract_versions cv on cv.contract_id = c.id and cv.version = c.sent_version
   where private.is_client_session()
     and c.client_id = auth.uid()
     and c.status in ('sent', 'signed')
   order by c.sent_at desc
   limit 100
$$;

-- Un contrat envoyé, tel qu'il a été figé : en-tête et sections de la version, tableau des services
-- (plus modifiable après l'envoi) et taux en vigueur à la date du contrat. null si ce n'est pas le sien.
create or replace function public.client_contract(p_contract uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', c.id, 'status', c.status, 'signing_mode', c.signing_mode, 'language', c.language,
           'sent_at', c.sent_at, 'viewed_at', c.viewed_at, 'accepted_at', c.accepted_at,
           'accepted_name', c.accepted_name, 'created_at', c.created_at, 'client_province', c.client_province,
           'snapshot', cv.snapshot,
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
   where private.is_client_session()
     and c.id = p_contract
     and c.client_id = auth.uid()
     and c.status in ('sent', 'signed')
$$;

-- Première consultation par le client (une seule fois, journalisée).
create or replace function public.client_contract_viewed(p_contract uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_matter uuid;
begin
  select c.matter_id into v_matter from public.contracts c
   where private.is_client_session() and c.id = p_contract and c.client_id = auth.uid()
     and c.status in ('sent', 'signed') and c.viewed_at is null
   for update;
  if not found then
    return;
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set viewed_at = now() where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.viewed', 'contract', p_contract::text, v_matter, '{}'::jsonb);
end $$;

-- 5 ------------------------------------------------------------------------------------------
create or replace function public.client_contract_accept(p_contract uuid, p_name text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_client_session() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select * into v from public.contracts c where c.id = p_contract and c.client_id = auth.uid() for update;
  -- Même réponse que « n'existe pas » pour un contrat qui n'est pas le sien.
  if not found or v.status not in ('sent', 'signed') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
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

revoke all on function public.contract_send(uuid, text), public.client_contracts(), public.client_contract(uuid),
  public.client_contract_viewed(uuid), public.client_contract_accept(uuid, text) from public, anon;
grant execute on function public.contract_send(uuid, text), public.client_contracts(), public.client_contract(uuid),
  public.client_contract_viewed(uuid), public.client_contract_accept(uuid, text) to authenticated;
