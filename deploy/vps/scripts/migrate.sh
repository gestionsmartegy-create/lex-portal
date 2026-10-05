#!/usr/bin/env bash
# Applique les migrations du dépôt (dans l'ordre, une seule fois chacune), puis — au premier
# passage — le seed de DÉMONSTRATION et les mots de passe des comptes fictifs (ADR 0016).
# Option --reset : efface la base de test et recommence (données fictives seulement).
set -euo pipefail
cd /opt/lexlaw
set -a; . ./.env; set +a
DC="docker compose --env-file .env"

if [[ "${1:-}" == "--reset" ]]; then
  $DC down -v --remove-orphans app auth rest gateway db >/dev/null
  $DC up -d db auth rest gateway mailpit
fi

psql_db() { $DC exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "attente de la base et de Supabase Auth…"
for _ in $(seq 1 90); do
  if psql_db -tAc "select to_regclass('auth.users') is not null and to_regclass('auth.mfa_factors') is not null" 2>/dev/null | grep -q t; then break; fi
  sleep 2
done

psql_db <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, applied_at timestamptz default now());
SQL

for f in src/supabase/migrations/*.sql; do
  name=$(basename "$f" .sql); version=${name%%_*}
  if psql_db -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'" | grep -q 1; then continue; fi
  echo "migration : $name"
  { echo "begin;"; cat "$f"; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"; echo "commit;"; } | psql_db
done

# Seed de démonstration : une seule fois (données fictives, comptes @example.com et @lexcanadalaw.test).
if ! psql_db -tAc "select 1 from supabase_migrations.schema_migrations where version = 'seed-demo'" | grep -q 1; then
  echo "seed de démonstration"
  { echo "begin;"; cat src/supabase/seed.sql; echo "insert into supabase_migrations.schema_migrations (version, name) values ('seed-demo', 'seed.sql');"; echo "commit;"; } | psql_db

  # Mots de passe des comptes fictifs : générés ici, jamais affichés, écrits dans ACCES.md (root, 600).
  umask 077
  gen() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-16 | sed 's/$/aA9!/'; }
  {
    echo "# Accès au serveur de TEST — https://lexlaw.2-24-110-184.sslip.io"
    echo "# Données fictives uniquement. Ne pas réutiliser ces mots de passe ailleurs."
    echo
    echo "## Boîte d'e-mails de test : https://lexlaw.2-24-110-184.sslip.io/_mail/"
    echo "- utilisateur : lex"
    echo "- mot de passe : $MAIL_PASSWORD"
    echo
    echo "## Comptes de démonstration"
  } > ACCES.md
  for email in john.doe@example.com jane.roe@example.com demo.staff@lexcanadalaw.test demo.admin@lexcanadalaw.test; do
    pw=$(gen)
    psql_db <<SQL
update auth.users set encrypted_password = extensions.crypt('$pw', extensions.gen_salt('bf')) where email = '$email';
SQL
    case "$email" in
      *@lexcanadalaw.test) where="https://lexlaw.2-24-110-184.sslip.io/fr/staff/login (formulaire « démonstration »)";;
      *) where="https://lexlaw.2-24-110-184.sslip.io/fr/login (puis double vérification à configurer)";;
    esac
    echo "- $email / $pw — $where" >> ACCES.md
  done
  chmod 600 ACCES.md
  echo "comptes de démonstration : mots de passe écrits dans /opt/lexlaw/ACCES.md"
fi
echo "migrations : à jour"
