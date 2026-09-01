#!/bin/bash
# =============================================================
# deploy.sh — Script de despliegue Pagos-Poliza-modulo
#
# Uso:
#   bash scripts/deploy.sh develop
#   bash scripts/deploy.sh qa
# =============================================================

set -euo pipefail

BRANCH="${1:-develop}"
SERVICE_DIR="/opt/services/Pagos-Poliza-modulo"
NGINX_DIR="/var/www/html/pagos/"
PM2_APP="pagos-api"

echo ""
echo "=============================================="
echo " 🚀 Deploy Pagos-Poliza-modulo"
echo " Rama    : $BRANCH"
echo " Fecha   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# 1. Ir al directorio del servicio
echo "📁 Navegando a $SERVICE_DIR..."
cd "$SERVICE_DIR"

# 2. Traer los últimos cambios
echo "📥 git pull origin $BRANCH..."
git pull origin "$BRANCH"

# 3. Instalar dependencias (server + frontend)
echo "📦 Instalando dependencias (npm run install:all)..."
npm run install:all

# 4. Compilar el frontend (cierrelmds: base ./ + prefijo /pagos)
echo "🔨 Compilando frontend..."
bash scripts/build-cierrelmds.sh

# 5. Copiar archivos compilados al directorio de Nginx
echo "📋 Copiando dist/ → $NGINX_DIR"
cp -r frontend/dist/* "$NGINX_DIR"

# 6. Recargar la API sin downtime
echo "♻️  Recargando proceso PM2: $PM2_APP..."
pm2 reload "$PM2_APP"

echo ""
echo "✅ Deploy completado exitosamente"
echo "=============================================="
