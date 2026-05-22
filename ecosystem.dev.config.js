/**
 * PM2 — Módulo Pagos (Desarrollo)
 *
 * Uso:
 *   pm2 start ecosystem.dev.config.js
 *   pm2 logs pagos-api
 *   pm2 restart pagos-api
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'pagos-api',
      cwd: path.join(ROOT, 'server'),
      script: 'node_modules/.bin/nodemon',
      args: 'src/index.js',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
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
      script: 'node_modules/.bin/vite',
      args: '--host',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
      out_file:   path.join(ROOT, 'logs', 'pagos-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'pagos-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
