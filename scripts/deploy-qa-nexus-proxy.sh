#!/usr/bin/env bash
# Deploy QA — pagos-api + pagos-web en PM2 (vite preview :5184).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-develop}"
cd "$ROOT"

echo "==> Pagos QA en $ROOT rama=$BRANCH"
git pull origin "$BRANCH"
test -f frontend/vite-nexus-preview-proxy.ts || { echo "ERROR: falta middleware nexus preview"; exit 1; }

echo "==> Dependencias server"
npm install --prefix server

echo "==> Build frontend (nexus proxy módulo)"
VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh

unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
echo "==> PM2 pagos-api + pagos-web"
pm2 reload pagos-api
pm2 restart pagos-web

sleep 2
curl -s -o /dev/null -w "pagos-web /pagos/ → HTTP %{http_code}\n" http://127.0.0.1:5184/pagos/ || true
echo "OK deploy QA Pagos (PM2)"
