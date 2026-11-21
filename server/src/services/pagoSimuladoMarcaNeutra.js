/**
 * Criterio del pago simulado para el flujo de prueba MarketPlace (marca neutra).
 *
 * El server de Pagos NO vuelve a verificar el pago contra el banco antes de
 * emitir (solo hace de proxy a Emisión); la verificación del pago móvil la
 * pide el front a /api/payments/verify-mobile. Por eso el bypass se decide aquí
 * y el front solo simula cuando este criterio responde `permitido: true`.
 *
 * Se permite solo si se cumplen TODAS:
 *   (a) la petición viene marcada como marca neutra (header X-Exelixi-Marca
 *       o query ?marca=neutra);
 *   (b) PAGO_SIMULADO_MARCA_NEUTRA=1 en el .env del server (solo en el 120;
 *       nunca por defecto);
 *   (c) el entorno no es producción: ENTORNO/APP_ENV no dicen producción y
 *       ningún host de la petición (Host, X-Forwarded-Host, Origin, Referer)
 *       es de producción (pagos.exelixitech.com + PAGOS_HOSTS_PRODUCCION).
 */

const HOSTS_PRODUCCION_FIJOS = ['pagos.exelixitech.com'];
const ENTORNOS_PRODUCCION = ['produccion', 'producción', 'production', 'prod'];

function flagActivo(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

function hostDe(value) {
  const raw = String(value ?? '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) return new URL(raw).hostname;
  } catch {
    return '';
  }
  // Host[:puerto]
  return raw.replace(/:\d+$/, '');
}

function header(headers, name) {
  if (!headers) return undefined;
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function hostsProduccion(env) {
  const extra = String(env.PAGOS_HOSTS_PRODUCCION ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...HOSTS_PRODUCCION_FIJOS, ...extra]);
}

/**
 * @param {{ env?: object, headers?: object, query?: object }} input
 * @returns {{ permitido: boolean, motivo: string }}
 */
function evaluarPagoSimuladoMarcaNeutra({ env = process.env, headers = {}, query = {} } = {}) {
  const marca = String(header(headers, 'x-exelixi-marca') ?? query?.marca ?? '')
    .trim()
    .toLowerCase();
  if (marca !== 'neutra') return { permitido: false, motivo: 'sin_marca_neutra' };

  if (!flagActivo(env.PAGO_SIMULADO_MARCA_NEUTRA)) {
    return { permitido: false, motivo: 'variable_desactivada' };
  }

  const entorno = String(env.ENTORNO ?? env.APP_ENV ?? '').trim().toLowerCase();
  if (ENTORNOS_PRODUCCION.includes(entorno)) {
    return { permitido: false, motivo: 'entorno_produccion' };
  }

  const prod = hostsProduccion(env);
  const hosts = [
    header(headers, 'host'),
    header(headers, 'x-forwarded-host'),
    header(headers, 'origin'),
    header(headers, 'referer'),
  ].map(hostDe).filter(Boolean);
  if (hosts.some((h) => prod.has(h))) {
    return { permitido: false, motivo: 'host_produccion' };
  }

  return { permitido: true, motivo: 'ok' };
}

module.exports = { evaluarPagoSimuladoMarcaNeutra };
