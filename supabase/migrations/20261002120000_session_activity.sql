-- ============================================================================
-- J3.2 — Expiration des sessions imposée par le serveur (ADR 0012)
-- ============================================================================
-- Décision du responsable (2026-10-02) : déconnexion après 30 min d'inactivité.
-- Le minuteur du navigateur n'est qu'une commodité ; la décision est prise ICI,
-- appelée par proxy.ts à chaque page protégée et par le signal d'activité.
--   inactivité > 32 min (30 + 2 de marge navigateur/serveur) → expired
--   session ouverte depuis > 12 h                            → expired
-- ============================================================================

create table private.session_activity (
  session_id   uuid primary key,              -- claim « session_id » du JWT Supabase
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index session_activity_user_idx on private.session_activity (user_id);

-- Aucun paramètre venant du client : session et utilisateur sont lus dans le JWT vérifié.
create or replace function public.touch_session()
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session uuid;
  v_user    uuid := auth.uid();
  v_row     private.session_activity%rowtype;
begin
  begin
    v_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session := null;
  end;
  if v_session is null or v_user is null then
    return 'expired';
  end if;

  select * into v_row from private.session_activity sa where sa.session_id = v_session for update;
  if not found then
    insert into private.session_activity (session_id, user_id) values (v_session, v_user);
    return 'active';
  end if;

  if v_row.user_id <> v_user
     or v_row.last_seen_at < now() - interval '32 minutes'
     or v_row.created_at < now() - interval '12 hours' then
    return 'expired';
  end if;

  -- Écriture limitée : au plus une mise à jour toutes les 30 s par session.
  if v_row.last_seen_at < now() - interval '30 seconds' then
    update private.session_activity sa set last_seen_at = now() where sa.session_id = v_session;
  end if;
  return 'active';
end $$;

revoke all on function public.touch_session() from public, anon;
grant execute on function public.touch_session() to authenticated;

-- Révocation de TOUTES les sessions d'un compte (procédure « téléphone perdu », ADR 0012).
-- Les jetons de rafraîchissement sont supprimés en cascade avec auth.sessions.
create or replace function public.revoke_user_sessions(p_user uuid)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_count = row_count;
  delete from private.session_activity sa where sa.user_id = p_user;
  return v_count;
end $$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
