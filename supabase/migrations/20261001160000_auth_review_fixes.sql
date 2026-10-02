-- ============================================================================
-- J3 — Corrections de la revue de sécurité (ADR 0010, addendum)
-- ============================================================================
-- M3 : aucun compte non-Microsoft ne peut être créé sur un domaine du
--      personnel, SAUF pré-création par le firm_admin : le serveur enregistre
--      d'abord une autorisation (private.staff_provisioning, via une RPC
--      réservée à service_role), puis crée le compte ; le trigger consomme
--      l'autorisation et attribue le rôle prévu. Empêche une invitation client
--      vers une adresse du cabinet (confusion d'identité à la 1re connexion
--      Microsoft). NB : GoTrue insère le compte AVANT d'y poser app_metadata,
--      d'où une table d'autorisation plutôt qu'un marqueur dans app_metadata.
-- F3 : vérification de limite SANS incrément (on ne compte que les échecs).
-- ============================================================================

create table private.staff_provisioning (
  email       text primary key check (email = lower(email)),
  role        public.app_role not null check (role in ('staff', 'firm_admin')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz
);

-- Autorisation de pré-création (valable 1 heure, usage unique).
create or replace function public.authorize_staff_provisioning(p_email text, p_role public.app_role, p_actor uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.staff_email_domains d where d.domain = lower(split_part(p_email, '@', 2))) then
    raise exception 'Domaine non autorisé pour le personnel' using errcode = '22023';
  end if;
  insert into private.staff_provisioning (email, role, created_by)
  values (lower(p_email), p_role, p_actor)
  on conflict (email) do update
    set role = excluded.role, created_by = excluded.created_by, created_at = now(), consumed_at = null;
end $$;

revoke all on function public.authorize_staff_provisioning(text, public.app_role, uuid) from public, anon, authenticated;
grant execute on function public.authorize_staff_provisioning(text, public.app_role, uuid) to service_role;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_provider  text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_domain    text := lower(split_part(new.email, '@', 2));
  v_staff_dom boolean := exists (select 1 from private.staff_email_domains d where d.domain = v_domain);
  v_planned   public.app_role;
  v_is_staff  boolean;
begin
  -- Autorisation de pré-création encore valide (1 h), consommée ici.
  update private.staff_provisioning sp
     set consumed_at = now()
   where sp.email = lower(new.email) and sp.consumed_at is null and sp.created_at > now() - interval '1 hour'
  returning sp.role into v_planned;

  -- Domaine du cabinet : seulement par Microsoft (azure) ou pré-création autorisée.
  if v_staff_dom and v_provider <> 'azure' and v_planned is null then
    raise exception 'Adresse réservée au personnel du cabinet' using errcode = '42501';
  end if;

  v_is_staff := v_staff_dom and (v_provider = 'azure' or v_planned is not null);

  insert into public.profiles (id, email, first_name, last_name, role, status)
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    case when v_is_staff then coalesce(v_planned, 'staff'::public.app_role) else 'client'::public.app_role end,
    case when v_is_staff then 'active'::public.user_status
         when v_provider = 'azure' then 'suspended'::public.user_status   -- Entra hors domaine : aucun accès
         else 'invited'::public.user_status end
  );
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end $$;

-- Lecture d'une limite sans l'incrémenter (true = encore autorisé).
create or replace function public.rate_limit_check(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select b.hits < p_max
    from private.rate_limit_buckets b
    where b.key = p_key and b.window_start > now() - make_interval(secs => p_window_seconds)
  ), true)
$$;

revoke all on function public.rate_limit_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, integer, integer) to service_role;
