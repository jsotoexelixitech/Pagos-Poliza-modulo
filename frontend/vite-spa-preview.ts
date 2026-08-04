import type { Plugin } from 'vite';
import { isBackendProxyPath } from './vite-paths';

/** Fallback SPA para `vite preview` bajo subpath (/pagos/). */
export function spaPreviewFallback(base: string): Plugin {
  const normalizedBase = base === './' ? '/' : base.endsWith('/') ? base : `${base}/`;
  const basePath = normalizedBase.replace(/\/$/, '');

  return {
    name: 'spa-preview-fallback',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        const raw = req.url ?? '/';
        const [pathname, search = ''] = raw.split('?');
        const qs = search ? `?${search}` : '';

        if (isBackendProxyPath(pathname)) {
          next();
          return;
        }

        const isUnderBase =
          pathname === basePath
          || pathname === normalizedBase.slice(0, -1)
          || pathname.startsWith(`${basePath}/`);

        if (isUnderBase && !pathname.includes('.') && pathname !== `${basePath}/index.html`) {
          req.url = `${normalizedBase}index.html${qs}`;
        }

        next();
      });
    },
  };
}
