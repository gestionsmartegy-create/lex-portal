-- ============================================================================
-- J3 — Support de l'authentification (ADR 0010)
-- ============================================================================
-- Limitation de débit applicative (connexion, mot de passe oublié, invitations).
-- Appelée UNIQUEMENT par le serveur (service_role) : jamais exposée au navigateur.
-- ============================================================================

-- Renvoie true si l'action est autorisée (compteur incrémenté), false si la
-- limite est atteinte dans la fenêtre courante. Atomique (une seule requête).
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  if p_key is null or length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'Paramètres de limitation invalides' using errcode = '22023';
  end if;

  insert into private.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else b.hits + 1 end,
        window_start = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then now() else b.window_start end
  returning hits into v_hits;

  return v_hits <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ----------------------------------------------------------------------------
-- Journal d'audit depuis le serveur : le schéma audit n'est pas exposé à
-- l'API ; ce relais public est réservé à service_role (AGENTS.md §2.8).
-- ----------------------------------------------------------------------------
create or replace function public.record_audit_event(
  p_action        text,
  p_resource_type text,
  p_resource_id   text  default null,
  p_matter_id     uuid  default null,
  p_metadata      jsonb default '{}',
  p_actor_id      uuid  default null,
  p_ip            inet  default null,
  p_user_agent    text  default null,
  p_request_id    text  default null
) returns bigint
language sql volatile security definer set search_path = '' as $$
  select audit.record(p_action, p_resource_type, p_resource_id, p_matter_id, p_metadata,
                      p_actor_id, p_ip, left(p_user_agent, 300), p_request_id)
$$;

revoke all on function public.record_audit_event(text, text, text, uuid, jsonb, uuid, inet, text, text)
  from public, anon, authenticated;
grant execute on function public.record_audit_event(text, text, text, uuid, jsonb, uuid, inet, text, text)
  to service_role;
