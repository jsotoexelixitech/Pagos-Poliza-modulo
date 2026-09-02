#!/bin/bash
# =============================================================
# deploy.sh — Despliegue Pagos-Poliza-modulo (PM2: pagos-api + pagos-web)
#
# Uso:
#   bash scripts/deploy.sh develop
#   bash scripts/deploy.sh qa
#   SERVICE_DIR=~/exelixi/Pagos-Poliza-modulo bash scripts/deploy.sh develop
# =============================================================

set -euo pipefail

BRANCH="${1:-develop}"
SERVICE_DIR="${SERVICE_DIR:-/opt/services/Pagos-Poliza-modulo}"
PM2_API="pagos-api"
PM2_WEB="pagos-web"

echo ""
echo "=============================================="
echo " 🚀 Deploy Pagos-Poliza-modulo"
echo " Rama    : $BRANCH"
echo " Frontend: pagos-web (vite preview :5184)"
echo " Fecha   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

echo "📁 Navegando a $SERVICE_DIR..."
cd "$SERVICE_DIR"

echo "📥 git pull origin $BRANCH..."
git pull origin "$BRANCH"

echo "📦 Instalando dependencias (npm run install:all)..."
npm run install:all

echo "🔨 Compilando frontend..."
VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh

echo "♻️  PM2: $PM2_API + $PM2_WEB..."
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
pm2 reload "$PM2_API"
pm2 restart "$PM2_WEB"

sleep 2
curl -s -o /dev/null -w "pagos-web /pagos/ → HTTP %{http_code}\n" http://127.0.0.1:5184/pagos/ || true

echo ""
echo "✅ Deploy completado"
echo "=============================================="
