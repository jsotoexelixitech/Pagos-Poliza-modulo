#!/usr/bin/env bash
# Build Pagos — producción GCIA (pagos.exelixitech.com, ruta raíz /).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/build-env-nexus.sh"
cd "$ROOT/frontend"
unset PORT VITE_APP_BASE VITE_DEPLOY_PREFIX VITE_EMISSION_CONTINUE_BASE DATABASE_URL 2>/dev/null || true
export VITE_APP_BASE=/
export VITE_NEXUS_API_URL=https://nexus-api.exelixitech.com
echo "Build Pagos PROD VITE_APP_BASE=${VITE_APP_BASE} VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
npm run build
echo ""
echo "Copiar dist/* al document root del vhost (NO a subcarpeta /pagos/)."
echo "IMPORTANTE: antes de pm2 reload ejecutar:"
echo "  unset PORT VITE_APP_BASE VITE_DEPLOY_PREFIX VITE_EMISSION_CONTINUE_BASE DATABASE_URL"
