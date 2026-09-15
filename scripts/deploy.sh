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
echo "📥 Sincronizando con origin/$BRANCH..."
git fetch origin "$BRANCH"
git checkout -f "$BRANCH"
git reset --hard "origin/$BRANCH"

# 3. Instalar dependencias (server + frontend)
echo "📦 Instalando dependencias (npm run install:all)..."
npm run install:all

# 4. Compilar el frontend
echo "🔨 Compilando frontend (VITE_APP_BASE=/pagos/)..."
export VITE_APP_BASE=/pagos/
export VITE_DEPLOY_PREFIX=/pagos
npm run build --prefix frontend

# 5. Copiar archivos compilados al directorio de Nginx y PM2
echo "📋 Copiando dist/ → $NGINX_DIR"
mkdir -p "$NGINX_DIR"
cp -r frontend/dist/* "$NGINX_DIR"

if [ -d "/home/proyect/exelixi/Pagos-Poliza-modulo/frontend/dist" ] && [ "$SERVICE_DIR" != "/home/proyect/exelixi/Pagos-Poliza-modulo" ]; then
  echo "📋 Sincronizando con /home/proyect/exelixi/Pagos-Poliza-modulo/frontend/dist/"
  mkdir -p /home/proyect/exelixi/Pagos-Poliza-modulo/frontend/dist/
  cp -r frontend/dist/* /home/proyect/exelixi/Pagos-Poliza-modulo/frontend/dist/
fi

# 6. Recargar la API sin downtime y reiniciar servidor web
echo "♻️  Recargando procesos PM2: $PM2_APP y pagos-web..."
pm2 reload "$PM2_APP"
pm2 restart pagos-web || true

echo ""
echo "✅ Deploy completado exitosamente"
echo "=============================================="
