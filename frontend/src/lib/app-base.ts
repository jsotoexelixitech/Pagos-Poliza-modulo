/** Base normalizada del módulo (Vite `base`). Ej. `/` o `/pagos/`. */
function normalizedBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

/** Base URL del módulo (Vite `base`). Ej. `/pagos/` → API en `/pagos/api`. */
export function moduleApiBase(): string {
  return `${normalizedBase()}api`;
}

/**
 * Ruta de un archivo en `public/` respetando el prefijo de despliegue.
 * Ej. publicAsset('logo.png') → `/pagos/logo.png` cuando base es `/pagos/`.
 */
export function publicAsset(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${normalizedBase()}${clean}`;
}
