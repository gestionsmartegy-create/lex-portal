-- Supabase Auth (GoTrue) doit être propriétaire de ses fonctions d'aide, comme avec la CLI
-- locale ; sinon sa première migration échoue (« must be owner of function uid »).
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

-- Extensions activées d'office par la CLI locale : Vault (jetons OAuth, ADR 0014) et statistiques.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
