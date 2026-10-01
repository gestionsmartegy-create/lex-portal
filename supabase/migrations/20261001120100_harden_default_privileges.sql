-- ============================================================================
-- Durcissement des privilèges par défaut (ADR 0007)
-- ============================================================================
-- Supabase accorde par défaut (par schéma) à anon et authenticated tous les
-- droits sur les FUTURES tables, séquences et fonctions créées par postgres
-- dans public. On les retire : tout nouvel objet est fermé par défaut et doit
-- recevoir un GRANT explicite dans sa migration (AGENTS.md §6). service_role
-- conserve ses droits (usage serveur uniquement).
--
-- Limite PostgreSQL : EXECUTE est accordé à PUBLIC au niveau GLOBAL pour toute
-- nouvelle fonction ; un retrait par schéma ne peut pas l'annuler, et un retrait
-- global casserait les extensions. Chaque nouvelle fonction de public doit donc
-- faire « revoke all on function … from public, anon » — vérifié par le test
-- bloquant supabase/tests/database/01_structure.test.sql.
-- ============================================================================

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Fonctions existantes de public : aucune n'est exécutable par PUBLIC ou anon.
-- Les RPC prévues restent accordées explicitement à authenticated
-- (list_audit_events, client_dashboard_counts : migration initiale).
revoke execute on all functions in schema public from public, anon;
grant execute on function public.list_audit_events(integer, timestamptz, uuid) to authenticated;
grant execute on function public.client_dashboard_counts() to authenticated;
