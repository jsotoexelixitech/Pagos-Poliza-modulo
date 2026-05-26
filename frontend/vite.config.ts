import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5184,
      allowedHosts: true,
      hmr: tunnel ? { clientPort: 443, protocol: 'wss' } : true,
      proxy: {
        // Las rutas de pólizas (emit + quote) viven en el backend de emisión (4004).
        '/api/policies': { target: 'http://localhost:4004', changeOrigin: true },
        // Catálogos INMA y valrep — también en emisión (4004) para mostrar datos en checkout.
        '/api/catalogo':  { target: 'http://localhost:4004', changeOrigin: true },
        '/api/valrep':    { target: 'http://localhost:4004', changeOrigin: true },
        // El resto (payments/*) sigue al backend de pagos (4003).
        '/api': { target: 'http://localhost:4003', changeOrigin: true },
        '/files': { target: 'http://localhost:4003', changeOrigin: true },
      },
    },
  }
})
