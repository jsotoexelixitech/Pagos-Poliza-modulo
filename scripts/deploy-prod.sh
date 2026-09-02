#!/bin/bash
# =============================================================
# deploy-prod.sh — Despliegue producción GCIA (pagos.exelixitech.com)
#
# App en ruta raíz (/). NO usar subcarpeta /pagos/ ni prefijo Apache.
#
# Uso:
#   bash scripts/deploy-prod.sh
#   NGINX_DIR=/var/www/pagos.exelixitech.com bash scripts/deploy-prod.sh
# =============================================================

set -euo pipefail

SERVICE_DIR="/opt/services/Pagos-Poliza-modulo"
NGINX_DIR="${NGINX_DIR:-/var/www/html/}"
PM2_APP="pagos-api"
BRANCH="${1:-main}"

echo ""
echo "=============================================="
echo " 🚀 Deploy Pagos-Poliza-modulo → PRODUCCIÓN"
echo " Host    : pagos.exelixitech.com (raíz /)"
echo " Rama    : $BRANCH"
echo " Destino : $NGINX_DIR"
echo " Fecha   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

cd "$SERVICE_DIR"
echo "📥 git pull origin $BRANCH..."
git pull origin "$BRANCH"

echo "📦 Instalando dependencias..."
npm run install:all

echo "🔨 Build frontend (VITE_APP_BASE=/)..."
bash scripts/build-prod.sh

echo "📋 Copiando dist/ → $NGINX_DIR"
mkdir -p "$NGINX_DIR"
cp -r frontend/dist/* "$NGINX_DIR"

echo "♻️  Recargando PM2: $PM2_APP..."
pm2 reload "$PM2_APP"

echo ""
echo "✅ Deploy PROD completado"
echo "   URL: https://pagos.exelixitech.com/?nexus_token=..."
echo "=============================================="
