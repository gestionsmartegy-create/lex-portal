-- Contrats, lot 3 (ADR 0036) : valider, relire, envoyer la version validée, relancer, refuser,
-- nouvelle version après l'envoi, PDF officiel avec empreinte.
--  1. Colonnes de validation, relance, refus et chaînage des versions sur public.contracts
--     (aucun droit de mise à jour par colonne : écrites seulement par les fonctions ci-dessous).
--  2. private.contract_pdfs : le PDF officiel (bytea) et son empreinte SHA-256, calculée par la base.
--  3. Validation réservée à un AVOCAT de l'équipe (responsable, d'origine ou collaborateur) ou au
--     firm_admin (décision du 2026-10-21) ; les adjoint·e·s préparent mais ne valident pas.
--  4. Envoi : seulement un contrat validé (la version validée est celle que le client lit).
--  5. Commentaires de relecture par section (public.contract_comments, RLS + tests).
--  6. Relance (une par jour au plus), refus par le client, nouvelle version, retour au brouillon.
-- Règle : AUCUNE instruction entre set_config('lex.contract_flow', 'on') et (…, 'off') autre que
-- l'UPDATE prévu (le garde-fou laisse passer la ligne pendant ce temps).

-- 1 ------------------------------------------------------------------------------------------
alter table public.contracts
  add column validated_at      timestamptz,
  add column validated_by      uuid references public.profiles(id) on delete set null,
  add column validated_version int check (validated_version is null or validated_version >= 1),
  add column pdf_sha256        text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  add column reminded_at       timestamptz,
  add column reminder_count    int not null default 0 check (reminder_count >= 0),
  add column declined_at       timestamptz,
  add column decline_reason    text check (decline_reason is null
                                           or (length(decline_reason) <= 500 and decline_reason !~ '[[:cntrl:]]')),
  add column previous_id       uuid references public.contracts(id) on delete restrict,
  add column superseded_by     uuid references public.contracts(id) on delete restrict;

-- 2 ------------------------------------------------------------------------------------------
create table private.contract_pdfs (
  contract_id uuid not null references public.contracts(id) on delete restrict,
  version     int not null check (version >= 1),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  pdf         bytea not null check (octet_length(pdf) between 100 and 5242880),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (contract_id, version)
);
alter table private.contract_pdfs enable row level security;

-- 3 ------------------------------------------------------------------------------------------
create or replace function private.is_contract_lawyer(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and private.is_staff()
       and (private.is_firm_admin()
            or (c.matter_id is null and c.created_by = auth.uid())
            or (c.matter_id is not null and exists (
                  select 1 from public.matter_team mt
                   where mt.matter_id = c.matter_id and mt.user_id = auth.uid()
                     and mt.role in ('responsible', 'originating', 'collaborator')))))
$$;
revoke all on function private.is_contract_lawyer(uuid) from public;
grant execute on function private.is_contract_lawyer(uuid) to authenticated;

-- Validation : version figée + PDF officiel ; l'empreinte est calculée ICI, jamais reçue du serveur.
create or replace function public.contract_validate(p_contract uuid, p_pdf_base64 text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_pdf bytea; v_sha text; v_version int;
begin
  if not private.can_edit_contract(p_contract) then
    raise exception 'not editable' using errcode = '42501';
  end if;
  if not private.is_contract_lawyer(p_contract) then
    raise exception 'lawyer only' using errcode = '42501';
  end if;
  select * into v from public.contracts c where c.id = p_contract for update;
  if v.template_draft then
    raise exception 'template draft' using errcode = '23514';
  end if;
  begin
    v_pdf := decode(p_pdf_base64, 'base64');
  exception when others then
    raise exception 'invalid pdf' using errcode = '22023';
  end;
  if v_pdf is null or octet_length(v_pdf) not between 100 and 5242880
     or substring(v_pdf from 1 for 5) <> '\x255044462d'::bytea then
    raise exception 'invalid pdf' using errcode = '22023';
  end if;
  v_sha := encode(extensions.digest(v_pdf, 'sha256'), 'hex');
  v_version := public.contract_save_version(p_contract, case v.language when 'fr' then 'Validée' else 'Validated' end);
  insert into private.contract_pdfs (contract_id, version, sha256, pdf, created_by)
  values (p_contract, v_version, v_sha, v_pdf, auth.uid());
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'validated', validated_at = now(), validated_by = auth.uid(), validated_version = v_version,
         pdf_sha256 = v_sha, locked_by = null, locked_until = null
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.pdf_generated', 'contract', p_contract::text, v.matter_id,
                       jsonb_build_object('version', v_version, 'sha256', v_sha));
  return v_sha;
end $$;

-- Retour au brouillon d'un contrat validé PAS encore envoyé (corriger avant l'envoi).
create or replace function public.contract_reopen(p_contract uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status <> 'validated' then
    raise exception 'not validated' using errcode = '23514';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'draft', validated_at = null, validated_by = null, validated_version = null, pdf_sha256 = null,
         locked_by = auth.uid(), locked_until = now() + interval '5 minutes'
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.reopened', 'contract', p_contract::text, v.matter_id, '{}'::jsonb);
end $$;

-- 4 ------------------------------------------------------------------------------------------
create or replace function public.contract_send(p_contract uuid, p_mode text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_signing text;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  -- Tout membre de l'équipe (décision du 2026-10-20), sur un contrat VALIDÉ.
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status <> 'validated' or v.validated_version is null then
    raise exception 'not validated' using errcode = '23514';
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
  select t.signing into v_signing from public.contract_templates t where t.id = v.template_id;
  if v_signing in ('clio', 'portal') and v_signing <> p_mode then
    raise exception 'mode imposed by template' using errcode = '23514';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'sent', sent_at = now(), sent_by = auth.uid(), sent_version = v.validated_version,
         signing_mode = p_mode, locked_by = null, locked_until = null
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  return v.validated_version;
end $$;

-- Le client voit aussi un contrat qu'il a refusé (état « Refusé »), jamais un contrat remplacé.
create or replace function private.client_sees_contract(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and private.is_client_session()
       and c.client_id = auth.uid()
       and c.status in ('sent', 'signed', 'declined')
       and (c.matter_id is null or private.client_access_level(c.matter_id) is not null))
$$;

create or replace function public.client_contract(p_contract uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', c.id, 'status', c.status, 'signing_mode', c.signing_mode, 'language', c.language,
           'sent_at', c.sent_at, 'viewed_at', c.viewed_at, 'accepted_at', c.accepted_at,
           'accepted_name', c.accepted_name, 'created_at', c.created_at, 'client_province', c.client_province,
           'declined_at', c.declined_at, 'decline_reason', c.decline_reason, 'pdf_sha256', c.pdf_sha256,
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

-- PDF officiel (base64) : le client destinataire (contrat envoyé) ou l'équipe. Téléchargement journalisé.
create or replace function public.contract_pdf(p_contract uuid)
returns table (version int, sha256 text, pdf_base64 text)
language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_client boolean;
begin
  select * into v from public.contracts c where c.id = p_contract;
  if not found or v.validated_version is null and v.sent_version is null then
    return;
  end if;
  v_client := private.client_sees_contract(p_contract);
  if not v_client and not private.can_access_contract(v.matter_id, v.created_by) then
    return;
  end if;
  perform audit.record('contract.pdf_downloaded', 'contract', p_contract::text, v.matter_id,
                       jsonb_build_object('by_client', v_client));
  return query
    select p.version, p.sha256, encode(p.pdf, 'base64')
      from private.contract_pdfs p
     where p.contract_id = p_contract
       and p.version = coalesce(case when v_client then v.sent_version end, v.validated_version, v.sent_version);
end $$;

-- 5 ------------------------------------------------------------------------------------------
create table public.contract_comments (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  section_id  uuid references public.contract_sections(id) on delete set null,
  body        text not null check (length(btrim(body)) between 1 and 2000 and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index contract_comments_contract_idx on public.contract_comments (contract_id, created_at);
alter table public.contract_comments enable row level security;

create or replace function private.can_comment_contract(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts c
                  where c.id = p_contract and private.can_access_contract(c.matter_id, c.created_by))
$$;
revoke all on function private.can_comment_contract(uuid) from public;
grant execute on function private.can_comment_contract(uuid) to authenticated;

create policy contract_comments_select on public.contract_comments for select to authenticated
  using (private.can_comment_contract(contract_id));
create policy contract_comments_insert on public.contract_comments for insert to authenticated
  with check (private.can_comment_contract(contract_id) and created_by = auth.uid() and resolved_at is null
              and (section_id is null or exists (select 1 from public.contract_sections s
                                                  where s.id = section_id and s.contract_id = contract_comments.contract_id)));
create policy contract_comments_update on public.contract_comments for update to authenticated
  using (private.can_comment_contract(contract_id)) with check (private.can_comment_contract(contract_id));
revoke all on public.contract_comments from anon, authenticated;
grant select on public.contract_comments to authenticated;
grant insert (contract_id, section_id, body, created_by) on public.contract_comments to authenticated;
grant update (resolved_at, resolved_by) on public.contract_comments to authenticated;

-- Seule la résolution change (marquer « réglé », ou rouvrir) ; l'auteur de la résolution est imposé.
create or replace function private.guard_contract_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.resolved_at := null;
    new.resolved_by := null;
  else
    new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
    if new.resolved_at is not null and old.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_contract_comment() from public;
create trigger contract_comments_guard before insert or update on public.contract_comments
  for each row execute function private.guard_contract_comment();

-- 6 ------------------------------------------------------------------------------------------
create or replace function public.contract_remind(p_contract uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype;
begin
  select * into v from public.contracts c where c.id = p_contract for update;
  if not found or not private.can_access_contract(v.matter_id, v.created_by) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.status <> 'sent' then
    raise exception 'not sent' using errcode = '23514';
  end if;
  if coalesce(v.reminded_at, v.sent_at) > now() - interval '1 day' then
    raise exception 'too soon' using errcode = '55000';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c set reminded_at = now(), reminder_count = c.reminder_count + 1 where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.reminded', 'contract', p_contract::text, v.matter_id,
                       jsonb_build_object('count', v.reminder_count + 1));
end $$;

create or replace function public.client_contract_decline(p_contract uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v public.contracts%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.client_sees_contract(p_contract) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select * into v from public.contracts c where c.id = p_contract for update;
  if v.status <> 'sent' then
    raise exception 'not declinable' using errcode = '23514';
  end if;
  if v_reason is not null and (length(v_reason) > 500 or v_reason ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  perform set_config('lex.contract_flow', 'on', true);
  update public.contracts c
     set status = 'declined', declined_at = now(), decline_reason = v_reason, viewed_at = coalesce(c.viewed_at, now())
   where c.id = p_contract;
  perform set_config('lex.contract_flow', 'off', true);
  -- Le trigger journalise « contract.declined » ; jamais le motif tapé.
end $$;

-- Nouvelle version après l'envoi (ou un refus) : un brouillon qui reprend tout ; l'ancien est « remplacé ».
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
  -- Le lien au modèle n'est gardé que si ce modèle est toujours publié.
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
  perform set_config('lex.contract_flow', 'off', true);
  perform audit.record('contract.new_version', 'contract', v_new::text, v.matter_id,
                       jsonb_build_object('previous', v.id));
  return v_new;
end $$;

revoke all on function public.contract_validate(uuid, text), public.contract_reopen(uuid), public.contract_pdf(uuid),
  public.contract_remind(uuid), public.client_contract_decline(uuid, text), public.contract_new_version(uuid)
  from public, anon;
grant execute on function public.contract_validate(uuid, text), public.contract_reopen(uuid), public.contract_pdf(uuid),
  public.contract_remind(uuid), public.client_contract_decline(uuid, text), public.contract_new_version(uuid)
  to authenticated;
