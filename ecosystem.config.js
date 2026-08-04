/**
 * PM2 — Módulo Pagos (Producción)
 *
 * Uso:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 stop pagos-api pagos-web
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
        PORT: 3001,
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
      env_production: {
        NODE_ENV: 'production',
      },
      out_file:   path.join(ROOT, 'logs', 'pagos-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'pagos-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
