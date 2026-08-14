#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pagos nexus proxy QA en $ROOT"
git pull origin main
test -f frontend/vite-nexus-preview-proxy.ts || { echo "ERROR: falta middleware"; exit 1; }

VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
pm2 restart pagos-web
sleep 2
curl -s -o /dev/null -w "pagos-web /pagos/ → HTTP %{http_code}\n" http://127.0.0.1:5184/pagos/ || true
echo "OK deploy QA Pagos nexus proxy"
