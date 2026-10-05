#!/usr/bin/env bash
# Déploie la branche courante sur le serveur de TEST (ADR 0016), depuis le poste du développeur.
# Usage : deploy/vps/scripts/deploy.sh [root@2.24.110.184]
# Ne touche QUE /opt/lexlaw et /etc/caddy/sites/lexlaw.caddy. Aucun secret ne quitte le serveur.
set -euo pipefail
HOST="${1:-root@2.24.110.184}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "1/5 envoi du code ($(git rev-parse --short HEAD))"
ssh "$HOST" 'mkdir -p /opt/lexlaw/src /opt/lexlaw/templates /opt/lexlaw/db /opt/lexlaw/scripts && rm -rf /opt/lexlaw/src.new && mkdir /opt/lexlaw/src.new'
git archive --format=tar HEAD | ssh "$HOST" 'tar -x -C /opt/lexlaw/src.new && rm -rf /opt/lexlaw/src && mv /opt/lexlaw/src.new /opt/lexlaw/src'
ssh "$HOST" 'cd /opt/lexlaw && cp src/deploy/vps/docker-compose.yml src/deploy/vps/auth.env src/deploy/vps/gateway.Caddyfile . \
  && cp src/deploy/vps/db/*.sql db/ && cp src/deploy/vps/scripts/*.sh scripts/ && chmod 700 scripts/*.sh \
  && cp src/supabase/templates/*.html templates/'

echo "2/5 secrets (générés sur le serveur s'ils n'existent pas)"
ssh "$HOST" '/opt/lexlaw/scripts/init-secrets.sh'

echo "3/5 services Supabase et migrations"
ssh "$HOST" 'cd /opt/lexlaw && docker compose --env-file .env up -d db auth rest gateway mailpit && ./scripts/migrate.sh'

echo "4/5 build et démarrage de l'application (plusieurs minutes avec 1 processeur)"
DEPLOYMENT_ID="$(git rev-parse --short HEAD)"
ssh "$HOST" "cd /opt/lexlaw && DEPLOYMENT_ID=$DEPLOYMENT_ID docker compose --env-file .env build app && DEPLOYMENT_ID=$DEPLOYMENT_ID docker compose --env-file .env up -d app"

echo "5/5 site Caddy (validation avant rechargement à chaud)"
ssh "$HOST" 'set -e; cd /opt/lexlaw; set -a; . ./.env; set +a
  hash=$(caddy hash-password --plaintext "$MAIL_PASSWORD")
  sed "s|__MAIL_HASH__|$hash|" src/deploy/vps/lexlaw.caddy > /etc/caddy/sites/lexlaw.caddy.new
  mv /etc/caddy/sites/lexlaw.caddy.new /etc/caddy/sites/lexlaw.caddy
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; else
    rm -f /etc/caddy/sites/lexlaw.caddy; echo "Caddy : configuration invalide, site retiré"; exit 1; fi'
echo "6/6 contrôle de fumée (l'API de la base répond vraiment)"
ssh "$HOST" 'set -e; cd /opt/lexlaw; set -a; . ./.env; set +a
  for _ in $(seq 1 20); do
    out=$(docker compose --env-file .env exec -T gateway wget -qO- \
      --header "apikey: $SERVICE_ROLE_KEY" --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
      --header "Content-Type: application/json" --post-data "{\"p_key\":\"smoke\",\"p_max\":1000,\"p_window_seconds\":60}" \
      http://rest:3000/rpc/rate_limit_check 2>/dev/null || true)
    [ "$out" = "true" ] && { echo "API : OK"; exit 0; }
    sleep 3
  done
  echo "API : ÉCHEC — voir docker compose logs rest"; exit 1'
echo "déployé : https://lexlaw.2-24-110-184.sslip.io"
