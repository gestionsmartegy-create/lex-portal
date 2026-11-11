-- =============================================================================================
-- Agendas Outlook réels (ADR 0043) : renouvellement des jetons sans refaire la connexion
-- =============================================================================================
-- Microsoft renouvelle le jeton d'accès toutes les heures et fait tourner le jeton de
-- rafraîchissement. calendar_save_connection() sert à la CONNEXION (date de connexion, audit
-- « calendar.connected ») : l'appeler à chaque renouvellement fausserait la date et remplirait le
-- journal. Cette fonction ne remplace que le contenu du coffre d'une connexion réelle déjà active.
-- Aucune nouvelle table : pas de RLS à ajouter. Réservée à service_role (synchronisation).

create or replace function public.calendar_update_tokens(p_user uuid, p_payload text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if p_payload is null or length(p_payload) = 0 or length(p_payload) > 16384 then
    raise exception 'invalid token payload' using errcode = '22023';
  end if;
  select c.vault_secret_id into v_secret
    from private.calendar_connections c
   where c.user_id = p_user and c.status = 'connected' and not c.is_mock;
  if v_secret is null then
    return false;
  end if;
  perform vault.update_secret(v_secret, p_payload);
  return true;
end $$;

revoke all on function public.calendar_update_tokens(uuid, text) from public, anon, authenticated;
grant execute on function public.calendar_update_tokens(uuid, text) to service_role;
