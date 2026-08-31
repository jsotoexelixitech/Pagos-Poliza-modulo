#!/usr/bin/env bash
# Build frontend Pagos — producción GCIA (subdominio https://pagos.exelixitech.com/, sin /pagos/)
#
# QA / cierrelmds siguen usando scripts/build-cierrelmds.sh (prefijo /pagos/).
#
# Uso en Srv-Gcia-proyect:
#   cd ~/exelixi/Pagos-Poliza-modulo
#   bash scripts/build-gcia-produccion.sh
#   unset PORT VITE_APP_BASE VITE_DEPLOY_PREFIX DATABASE_URL
#   pm2 reload pagos-web

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT/frontend"

unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL VITE_DEPLOY_PREFIX 2>/dev/null || true
export VITE_APP_BASE=/
export VITE_DEPLOY_PREFIX=
export VITE_NEXUS_API_URL="${VITE_NEXUS_API_URL:-https://nexus-api.exelixitech.com}"
export VITE_NEXUS_USE_MODULE_PROXY=0
export VITE_BRIDGE_MODULE_ORDER=4

echo "Build Pagos GCIA producción"
echo "  VITE_APP_BASE=${VITE_APP_BASE}"
echo "  VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
npm run build
echo ""
echo "Verificar assets en dist/index.html (deben ser /assets/..., NO /pagos/assets/):"
grep -o 'src="[^"]*"' dist/index.html | head -3
echo ""
echo "pm2 reload pagos-web"
