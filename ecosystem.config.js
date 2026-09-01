/**
 * PM2 — Módulo Pagos
 *
 * GCIA (pagos.exelixitech.com, sin /pagos/):
 *   pm2 start ecosystem.config.js --only pagos-web --env production
 *
 * QA / cierrelmds (prefijo /pagos/):
 *   pm2 start ecosystem.config.js --only pagos-web --env cierrelmds
 *
 * Tras cambiar env del preview: pm2 delete pagos-web && pm2 start … (no basta reload).
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'pagos-api',
      cwd: path.join(ROOT, 'server'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4003,
      },
      out_file:   path.join(ROOT, 'logs', 'pagos-api.out.log'),
      error_file: path.join(ROOT, 'logs', 'pagos-api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'pagos-web',
      cwd: path.join(ROOT, 'frontend'),
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host --port 5184 --strictPort',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      /** GCIA subdominio — base / (debe coincidir con build-gcia-produccion.sh) */
      env_production: {
        NODE_ENV: 'production',
        VITE_APP_BASE: '/',
        VITE_DEPLOY_PREFIX: '',
      },
      /** QA / cierrelmds — Apache /pagos/ */
      env_cierrelmds: {
        NODE_ENV: 'production',
        VITE_APP_BASE: './',
        VITE_DEPLOY_PREFIX: '/pagos',
      },
      out_file:   path.join(ROOT, 'logs', 'pagos-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'pagos-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
