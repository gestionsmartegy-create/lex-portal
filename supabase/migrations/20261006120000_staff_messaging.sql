-- ============================================================================
-- J7 — Messagerie du cabinet (ADR 0017)
-- ============================================================================
-- 1. public.matter_permissions : droits EFFECTIFS sur un dossier pour la session
--    courante (security INVOKER : mêmes règles que la RLS, aucune élévation).
--    Source unique pour l'application (assertMatterAccess) — client OU personnel.
-- 2. public.join_conversation : un membre de l'ÉQUIPE du dossier (ou un firm_admin)
--    rejoint un fil pour pouvoir le lire et y répondre (les messages exigent d'être
--    participant). Personne d'autre : ni un client, ni le personnel hors équipe.
-- ============================================================================

create or replace function public.matter_permissions(p_matter uuid)
returns table (can_read boolean, can_write boolean)
language sql stable security invoker set search_path = '' as $$
  -- coalesce : « aucun accès » doit valoir false, jamais NULL (NULL = inconnu, ambigu côté application).
  select coalesce(private.can_read_matter(p_matter), false), coalesce(private.can_write_matter(p_matter), false)
$$;

revoke all on function public.matter_permissions(uuid) from public, anon;
grant execute on function public.matter_permissions(uuid) to authenticated;

create or replace function public.join_conversation(p_conversation uuid)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_matter uuid;
begin
  select c.matter_id into v_matter from public.conversations c where c.id = p_conversation;
  if v_matter is null then
    return false; -- fil introuvable ou général : rien à rejoindre
  end if;
  if not (private.is_firm_admin() or (private.is_staff() and private.is_on_matter_team(v_matter))) then
    return false;
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  values (p_conversation, auth.uid())
  on conflict do nothing;
  return true;
end $$;

revoke all on function public.join_conversation(uuid) from public, anon;
grant execute on function public.join_conversation(uuid) to authenticated;

-- 3. Correctif (B6/C7) : créer un fil en demandant son identifiant en retour échouait, car la
--    visibilité du fil (RLS) est vérifiée AVANT que le trigger n'inscrive son auteur comme
--    participant. L'application génère donc l'identifiant (UUID aléatoire côté serveur) et
--    insère sans retour : la colonne id redevient insérable (aucune autre colonne ajoutée).
grant insert (id) on public.conversations to authenticated;
