-- ============================================================================
-- Phase 2 — Jetons OAuth des intégrations dans Supabase Vault (ADR 0013, ADR 0014)
-- ============================================================================
-- private.integration_connections (déjà créée) ne garde qu'une RÉFÉRENCE
-- (vault_secret_id) : les jetons sont chiffrés par Supabase Vault et ne sont
-- lisibles que par ces fonctions, exécutables par service_role SEULEMENT.
-- Le firm_admin voit l'état des connexions (jamais les jetons).
-- ============================================================================

-- Enregistre (ou remplace) les jetons d'une connexion. p_payload : JSON des jetons.
create or replace function public.integration_save_tokens(
  p_provider text, p_region text, p_payload text, p_scopes text[], p_actor uuid default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_provider private.integration_provider := p_provider::private.integration_provider;
  v_secret   uuid;
  v_name     text := format('oauth:%s:%s', p_provider, coalesce(p_region, '-'));
begin
  select ic.vault_secret_id into v_secret
    from private.integration_connections ic where ic.provider = v_provider and ic.region is not distinct from p_region;
  if v_secret is null then
    v_secret := vault.create_secret(p_payload, v_name, 'Jetons OAuth du portail (ne jamais exporter)');
  else
    perform vault.update_secret(v_secret, p_payload);
  end if;
  insert into private.integration_connections (provider, region, status, vault_secret_id, scopes, connected_by, connected_at, last_error)
  values (v_provider, p_region, 'connected', v_secret, coalesce(p_scopes, '{}'), p_actor, now(), null)
  on conflict (provider, region) do update
    set status = 'connected', vault_secret_id = excluded.vault_secret_id, scopes = excluded.scopes,
        connected_by = coalesce(excluded.connected_by, private.integration_connections.connected_by),
        connected_at = coalesce(private.integration_connections.connected_at, excluded.connected_at),
        last_error = null;
end $$;

-- Lecture des jetons (déchiffrés) : null si aucune connexion active.
create or replace function public.integration_read_tokens(p_provider text, p_region text)
returns text
language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret
    from private.integration_connections ic
    join vault.decrypted_secrets ds on ds.id = ic.vault_secret_id
   where ic.provider = p_provider::private.integration_provider
     and ic.region is not distinct from p_region
     and ic.status = 'connected'
$$;

-- État après une synchronisation ou une erreur (code interne, jamais de réponse brute d'API).
create or replace function public.integration_report(p_provider text, p_region text, p_ok boolean, p_error text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update private.integration_connections ic
     set last_sync_at = case when p_ok then now() else ic.last_sync_at end,
         last_error = case when p_ok then null else left(p_error, 64) end,
         status = case when not p_ok and p_error = 'TOKEN_REVOKED' then 'error'::private.integration_status else ic.status end
   where ic.provider = p_provider::private.integration_provider and ic.region is not distinct from p_region;
end $$;

-- Déconnexion : le secret est SUPPRIMÉ du coffre, la connexion passe à « revoked ».
create or replace function public.integration_disconnect(p_provider text, p_region text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_secret uuid;
begin
  update private.integration_connections ic
     set status = 'revoked', vault_secret_id = null
   where ic.provider = p_provider::private.integration_provider and ic.region is not distinct from p_region
  returning (select ic2.vault_secret_id from private.integration_connections ic2 where ic2.id = ic.id) into v_secret;
  delete from vault.secrets s
   where s.name = format('oauth:%s:%s', p_provider, coalesce(p_region, '-'));
end $$;

revoke all on function public.integration_save_tokens(text, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.integration_read_tokens(text, text) from public, anon, authenticated;
revoke all on function public.integration_report(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.integration_disconnect(text, text) from public, anon, authenticated;
grant execute on function public.integration_save_tokens(text, text, text, text[], uuid) to service_role;
grant execute on function public.integration_read_tokens(text, text) to service_role;
grant execute on function public.integration_report(text, text, boolean, text) to service_role;
grant execute on function public.integration_disconnect(text, text) to service_role;

-- État des connexions pour l'espace cabinet : firm_admin uniquement, AUCUN jeton.
create or replace function public.integration_status_list()
returns table (provider text, region text, status text, connected_at timestamptz, last_sync_at timestamptz, last_error text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_firm_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select ic.provider::text, ic.region, ic.status::text, ic.connected_at, ic.last_sync_at, ic.last_error
      from private.integration_connections ic order by ic.provider;
end $$;

revoke all on function public.integration_status_list() from public, anon;
grant execute on function public.integration_status_list() to authenticated;
