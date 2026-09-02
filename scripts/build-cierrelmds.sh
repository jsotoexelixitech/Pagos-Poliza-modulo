#!/usr/bin/env bash
# Build Pagos — cierrelmds / QA compartido (https://cierrelmds.exelixitech.com/pagos/).
# NO usar en pagos.exelixitech.com (producción GCIA → scripts/build-prod.sh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/build-env-nexus.sh"
cd "$ROOT/frontend"
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL 2>/dev/null || true
export VITE_APP_BASE=/pagos/
export VITE_DEPLOY_PREFIX=/pagos
echo "Build Pagos VITE_APP_BASE=${VITE_APP_BASE} VITE_DEPLOY_PREFIX=${VITE_DEPLOY_PREFIX}"
npm run build
echo ""
echo "IMPORTANTE: antes de pm2 reload ejecutar:"
echo "  unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL"
