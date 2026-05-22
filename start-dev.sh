#!/usr/bin/env bash
# =============================================================
#  modulo-pagos/start-dev.sh
#
#  Uso:
#    chmod +x start-dev.sh
#    ./start-dev.sh             # backend (4003) + frontend (5184)
#    ./start-dev.sh --tunnel    # + Cloudflare HTTPS público
#    ./start-dev.sh --pm2       # via PM2 (persistente)
# =============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WITH_TUNNEL=false
WITH_PM2=false

for arg in "$@"; do
  case $arg in
    --tunnel|-t) WITH_TUNNEL=true ;;
    --pm2)       WITH_PM2=true    ;;
  esac
done

B='\033[1m'; C='\033[36m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; N='\033[0m'
banner() { echo -e "\n${C}══════════════════════════════${N}\n${B}  $1${N}\n${C}══════════════════════════════${N}"; }
ok()     { echo -e "${G}[OK]${N} $1"; }
info()   { echo -e "${C}[>>]${N} $1"; }
warn()   { echo -e "${Y}[!!]${N} $1"; }
die()    { echo -e "${R}[ERROR]${N} $1"; exit 1; }

banner "Módulo Pagos · Exelixi"

command -v node >/dev/null 2>&1 || die "Node.js no instalado."

if [[ ! -f "$ROOT/server/.env" ]]; then
  [[ -f "$ROOT/server/.env.example" ]] && cp "$ROOT/server/.env.example" "$ROOT/server/.env" \
    && warn "Copia server/.env creada. Edita MERITOP_APIKEY y SYPAGO antes de continuar." \
    || die "No existe server/.env"
fi

[[ ! -d "$ROOT/server/node_modules" ]]   && npm install --prefix "$ROOT/server" --silent   && ok "server/node_modules listos"
[[ ! -d "$ROOT/frontend/node_modules" ]] && npm install --prefix "$ROOT/frontend" --silent && ok "frontend/node_modules listos"

mkdir -p "$ROOT/logs"

info "Liberando puertos 4003 / 5184..."
fuser -k 4003/tcp 2>/dev/null || true
fuser -k 5184/tcp 2>/dev/null || true
sleep 1

if $WITH_PM2; then
  command -v pm2 >/dev/null 2>&1 || die "PM2 no instalado. Ejecuta: npm install -g pm2"
  banner "Iniciando con PM2"
  cd "$ROOT" && pm2 start ecosystem.dev.config.js && pm2 save
  echo ""
  ok "pagos-api → http://localhost:4003"
  ok "pagos-api → http://localhost:4003/docs  (Swagger)"
  ok "pagos-web → http://localhost:5184"
  info "Logs: pm2 logs pagos-api"
  exit 0
fi

banner "Iniciando servicios"

cd "$ROOT/server"
nohup node_modules/.bin/nodemon src/index.js > "$ROOT/logs/pagos-api.out.log" 2>&1 &
API_PID=$!
sleep 2
kill -0 $API_PID 2>/dev/null || die "Servidor no pudo iniciar. Ver: $ROOT/logs/pagos-api.out.log"
ok "Servidor Pagos activo (PID $API_PID)"

CF_PID=""
if $WITH_TUNNEL; then
  command -v cloudflared >/dev/null 2>&1 || die "cloudflared no instalado."
  CF_LOG="$ROOT/logs/cloudflare.log"
  export VITE_HMR_TUNNEL=1
  cloudflared tunnel --url "http://localhost:5184" > "$CF_LOG" 2>&1 &
  CF_PID=$!
  info "Esperando URL de Cloudflare..."
  for i in $(seq 1 20); do
    CF_URL=$(grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)
    [[ -n "$CF_URL" ]] && break; sleep 1
  done
  [[ -n "${CF_URL:-}" ]] && echo -e "${B}${G}  URL pública HTTPS: $CF_URL${N}" || warn "URL aún no disponible."
fi

trap "kill $API_PID ${CF_PID:-} 2>/dev/null; echo -e '\n${Y}Detenido.${N}'; exit 0" INT TERM

echo ""
echo -e "  ${B}API:${N}     ${C}http://localhost:4003/api/health${N}"
echo -e "  ${B}Swagger:${N} ${C}http://localhost:4003/docs${N}"
echo -e "  ${B}Web:${N}     ${C}http://localhost:5184${N}"
echo ""

cd "$ROOT/frontend" && node_modules/.bin/vite --host
