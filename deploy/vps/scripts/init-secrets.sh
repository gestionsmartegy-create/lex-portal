#!/usr/bin/env bash
# Génère les secrets du serveur de TEST (ADR 0016), SUR LE SERVEUR, une seule fois.
# Rien n'est affiché ; /opt/lexlaw/.env et ACCES.md sont en chmod 600 (root).
set -euo pipefail
cd /opt/lexlaw
umask 077

if [[ -f .env ]]; then
  echo "secrets : déjà présents (.env conservé)"
  exit 0
fi

rand() { openssl rand -hex "$1"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # rôle, secret
  local now exp header payload sig
  now=$(date +%s); exp=$((now + 10 * 365 * 24 * 3600))
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" "$exp" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

JWT_SECRET=$(rand 32)
MAIL_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
{
  echo "# Serveur de TEST — secrets générés le $(date -u +%FT%TZ). Ne jamais copier ailleurs."
  echo "SITE_URL=https://lexlaw.2-24-110-184.sslip.io"
  echo "POSTGRES_PASSWORD=$(rand 24)"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "ANON_KEY=$(jwt anon "$JWT_SECRET")"
  echo "SERVICE_ROLE_KEY=$(jwt service_role "$JWT_SECRET")"
  echo "CRON_SECRET=$(rand 32)"
  echo "MAIL_PASSWORD=$MAIL_PASSWORD"
} > .env
chmod 600 .env
echo "secrets : générés (.env, chmod 600)"
