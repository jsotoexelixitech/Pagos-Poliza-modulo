#!/usr/bin/env bash
# Build Pagos frontend para cierrelmds (evita VITE_APP_BASE absoluto contaminado del shell).
set -euo pipefail
cd "$(dirname "$0")/../frontend"
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL 2>/dev/null || true
export VITE_APP_BASE=./
export VITE_NEXUS_API_URL="${VITE_NEXUS_API_URL:-https://cierrelmds.exelixitech.com/nexus-api}"
echo "Build Pagos VITE_APP_BASE=${VITE_APP_BASE}"
npm run build
echo ""
echo "IMPORTANTE: antes de pm2 start ejecutar en el shell:"
echo "  unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL"
