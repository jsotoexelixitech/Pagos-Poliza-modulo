import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'

  // Backend de pagos. Por defecto 4003 (puerto real en el servidor). Override
  // con VITE_PAGOS_API si en local corre en otro puerto (p.ej. 3001).
  const pagosApi = env.VITE_PAGOS_API || 'http://localhost:4003'

  // Mismo mapa de proxy para el dev server (`vite`) y para `vite preview`
  // (producción sirve el build con preview, que NO hereda `server.proxy`).
  const proxy = {
    // Las rutas de pólizas (emit + quote) viven en el backend de emisión (4004).
    '/api/policies': { target: 'http://localhost:4004', changeOrigin: true },
    // Catálogos INMA y valrep — también en emisión (4004) para mostrar datos en checkout.
    '/api/catalogo':  { target: 'http://localhost:4004', changeOrigin: true },
    '/api/valrep':    { target: 'http://localhost:4004', changeOrigin: true },
    // El resto (payments/* y personas/* → funerario) va al backend de pagos.
    '/api': { target: pagosApi, changeOrigin: true },
    '/files': { target: pagosApi, changeOrigin: true },
    '/docs': { target: pagosApi, changeOrigin: true },
    '/docs.json': { target: pagosApi, changeOrigin: true },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5180,
      allowedHosts: true,
      hmr: tunnel ? { clientPort: 443, protocol: 'wss' } : true,
      proxy,
    },
    preview: {
      host: true,
      allowedHosts: true,
      proxy,
    },
  }
})
