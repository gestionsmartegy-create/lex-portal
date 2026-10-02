-- ============================================================================
-- Revue de sécurité J4/J5/Phase 2 (ADR 0014, addendum) — intégrité de la messagerie
-- ============================================================================
-- M1 : un client pouvait fixer created_at (antidater un message) ou créer un fil
-- déjà clos / avec une fausse date, en appelant l'API directement. On limite les
-- colonnes insérables par l'API et, pour une session utilisateur, la base impose
-- les dates. Le seed local (rôle postgres) garde ses dates relatives.
-- ============================================================================

revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

revoke insert on public.conversations from authenticated;
grant insert (matter_id, scope, subject, created_by) on public.conversations to authenticated;

revoke insert on public.conversation_participants from authenticated;
grant insert (conversation_id, user_id) on public.conversation_participants to authenticated;

create or replace function private.force_server_timestamps()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.created_at := now();
    if tg_table_name = 'conversations' then
      new.closed_at := null;
      new.last_message_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger messages_server_timestamps before insert on public.messages
  for each row execute function private.force_server_timestamps();
create trigger conversations_server_timestamps before insert on public.conversations
  for each row execute function private.force_server_timestamps();
