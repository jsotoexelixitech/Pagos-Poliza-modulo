/**
 * Modo «marca neutra» (flujo de prueba del MarketPlace Exélixi, RCV y Funerario).
 *
 * Contrato común portal + módulos:
 *   - `?marca=neutra` → sessionStorage['exelixi_marca'] = 'neutra'
 *   - `?marca=lm`     → se borra la clave
 *   - sin parámetro   → lo guardado (el 120 comparte origen entre módulos)
 *
 * Con el modo activo no se muestra nada de La Mundial: el nombre se reemplaza
 * por el wordmark tipográfico «Exélixi». Sin el modo, todo queda igual.
 */

const STORAGE_KEY = 'exelixi_marca';
const NEUTRA = 'neutra';

/** Nombre que se muestra en lugar de La Mundial con el modo activo. */
export const MARCA_NEUTRA_NOMBRE = 'Exélixi';

let cached: boolean | null = null;

function leerMarca(): boolean {
  if (typeof window === 'undefined') return false;
  let param: string | null = null;
  try {
    param = new URLSearchParams(window.location.search).get('marca');
  } catch {
    param = null;
  }
  const valor = param?.trim().toLowerCase() ?? null;
  try {
    if (valor === NEUTRA) {
      window.sessionStorage.setItem(STORAGE_KEY, NEUTRA);
      return true;
    }
    if (valor === 'lm') {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === NEUTRA;
  } catch {
    // Sin sessionStorage: solo vale el parámetro de la URL.
    return valor === NEUTRA;
  }
}

/** ¿Está activo el modo marca neutra? (se evalúa una vez por carga). */
export function esMarcaNeutra(): boolean {
  if (cached === null) cached = leerMarca();
  return cached;
}

function setMeta(name: string, content: string): void {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
}

function aplicarFaviconNeutro(): void {
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    )
    .forEach((link) => link.remove());
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  // Asset Exélixi existente (sin isotipo ni nombre de La Mundial).
  link.href = `${base.endsWith('/') ? base : `${base}/`}exelixi-favicon.svg`;
  document.head.appendChild(link);
}

/**
 * Debe llamarse en main.tsx antes del primer render.
 * Fija `data-marca="neutra"`, título, metadatos y favicon neutros.
 */
export function aplicarMarcaNeutra(): void {
  if (!esMarcaNeutra()) return;
  try {
    document.documentElement.dataset.marca = NEUTRA;
    document.title = `${MARCA_NEUTRA_NOMBRE} · Pago`;
    setMeta('description', `Pago digital de pólizas — ${MARCA_NEUTRA_NOMBRE}.`);
    setMeta('apple-mobile-web-app-title', MARCA_NEUTRA_NOMBRE);
    setMeta('application-name', MARCA_NEUTRA_NOMBRE);
    aplicarFaviconNeutro();
  } catch {
    /* ignore */
  }
}

// Evaluación inmediata al cargar el módulo (antes del primer render).
esMarcaNeutra();
