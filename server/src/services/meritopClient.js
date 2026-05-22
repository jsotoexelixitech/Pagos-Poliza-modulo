/**
 * Cliente Meritop — Verificación de Pago Móvil
 *
 * Meritop es el gateway de pagos que actúa como proxy entre el sistema
 * y los bancos venezolanos. La API consta de dos pasos:
 *
 *   1. POST /login           → autenticación con X-API-KEY → JWT
 *   2. POST /payment/verifymobilepayment → verificar pago con token
 *
 * El JWT se cachea en memoria y se reutiliza hasta que expire (margen 60 s).
 * Si se recibe 401, se refresca automáticamente una vez y se reintenta.
 *
 * Variables de entorno requeridas:
 *   MERITOP_URL2       Base URL del proxy. Ej: http://172.30.149.18:9040/APIs-ProxiesCore/api
 *   MERITOP_APIKEY     GUID de autenticación (X-API-KEY header en /login)
 *
 * Variables de entorno opcionales / para futuras integraciones:
 *   MERITOP_URL        URL alternativa del servicio
 *   MERITOP_IP         IP de origen autorizada por Meritop
 *   MERITOP_USERNAME   Usuario del integrador
 *   MERITOP_PASSWORD   Contraseña del integrador
 *   MERITOP_BANK       UUID del banco en Meritop
 *   MERITOP_CHANNEL    UUID del canal en Meritop
 *   MERITOP_TERMINAL   UUID del terminal en Meritop
 *
 *   MERITOP_ENABLED    "true" | "false". Default: true
 *   MERITOP_TIMEOUT    Timeout HTTP en ms. Default: 15000
 */

const axios = require('axios');

const DEFAULT_TIMEOUT = 15_000;

// ── Códigos de resultado documentados por Meritop ─────────────────────────
const RESULT_CODES = {
  B000: 'Transacción encontrada (ya usada)',
  B001: 'Transacción no encontrada',
  B002: 'Transacción duplicada (pago ya registrado en otra operación)',
  B003: 'Error de parámetros (campo vacío)',
  B004: 'Error de conexión con el Gateway',
  B005: 'Error de conexión Gateway-AS400',
  B010: 'Transacción encontrada y disponible',
};

// ── Cache del token JWT ────────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: null };

function _isTokenValid() {
  if (!_tokenCache.token || !_tokenCache.expiresAt) return false;
  return new Date(_tokenCache.expiresAt).getTime() - 60_000 > Date.now();
}

function _getConfig() {
  const baseUrl = process.env.MERITOP_URL2
    ? `${process.env.MERITOP_URL2}/APIs-ProxiesCore/api`
    : 'http://172.30.149.18:9040/APIs-ProxiesCore/api';

  return {
    baseUrl,
    apiKey   : process.env.MERITOP_APIKEY   || '',
    enabled  : process.env.MERITOP_ENABLED !== 'false',
    timeout  : Number(process.env.MERITOP_TIMEOUT || DEFAULT_TIMEOUT),
    // Credenciales extendidas (disponibles para futuras integraciones)
    username : process.env.MERITOP_USERNAME || '',
    password : process.env.MERITOP_PASSWORD || '',
    bank     : process.env.MERITOP_BANK     || '',
    channel  : process.env.MERITOP_CHANNEL  || '',
    terminal : process.env.MERITOP_TERMINAL || '',
  };
}

/**
 * Obtiene un JWT fresco desde Meritop o devuelve el cacheado.
 */
async function _getToken(forceRefresh = false) {
  if (!forceRefresh && _isTokenValid()) return _tokenCache.token;

  const { baseUrl, apiKey, timeout } = _getConfig();

  if (!apiKey) {
    throw Object.assign(
      new Error('MERITOP_APIKEY no está configurado en .env'),
      { code: 'MERITOP_MISSING_APIKEY' }
    );
  }

  let res;
  try {
    res = await axios.post(
      `${baseUrl}/login`,
      {},
      {
        headers : { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        timeout,
      }
    );
  } catch (err) {
    const status  = err.response?.status;
    const errCode = String(err.response?.data?.code || '');
    const errMsg  = err.response?.data?.message || err.message;

    if (status === 401 && errCode === '603') {
      throw Object.assign(new Error('API Key de Meritop inválida (código 603)'), { code: 'MERITOP_INVALID_APIKEY' });
    }
    if (status === 401 && errCode === '604') {
      throw Object.assign(new Error('IP de origen no autorizada por Meritop (código 604)'), { code: 'MERITOP_IP_NOT_ALLOWED' });
    }
    if (!err.response) {
      throw Object.assign(
        new Error('No se pudo conectar con Meritop. Verifica la VPN o la red interna.'),
        { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message }
      );
    }
    throw Object.assign(
      new Error(`Error al autenticar con Meritop: ${errMsg}`),
      { code: 'MERITOP_AUTH_ERROR' }
    );
  }

  _tokenCache = { token: res.data.token, expiresAt: res.data.expiresAt };
  return _tokenCache.token;
}

/**
 * Verifica si un pago móvil es válido consultando la API de Meritop.
 *
 * @param {object} params
 * @param {string} params.sourcePhoneNumber  Teléfono de origen (ej. "04121234567")
 * @param {string} params.bankCode           Código de banco venezolano (ej. "0172")
 * @param {number} params.amount             Monto en Bs (decimal)
 * @param {string} params.paidOn             ISO 8601 datetime (ej. "2025-12-02T13:30:00")
 *
 * @returns {Promise<{
 *   isVerified: boolean,
 *   reference: string|null,
 *   verifiedAmount: number|null,
 *   verifiedOn: string|null,
 *   message: string,
 *   code: string,
 * }>}
 */
/**
 * Modo mock — simula una respuesta exitosa de Meritop.
 * Actívalo con MERITOP_MOCK=true en .env cuando no hay acceso a la red interna.
 */
function _mockResponse({ sourcePhoneNumber, bankCode, amount }) {
  const ref = 'REF' + Date.now().toString().slice(-9);
  return {
    isVerified     : true,
    reference      : ref,
    verifiedAmount : amount,
    verifiedOn     : new Date().toISOString(),
    message        : 'Transacción encontrada y disponible [MODO PRUEBA]',
    code           : 'B010',
  };
}

async function verifyMobilePayment({ sourcePhoneNumber, bankCode, amount, paidOn }) {
  const { baseUrl, enabled, timeout } = _getConfig();

  if (!enabled) {
    throw Object.assign(
      new Error('El módulo de Meritop está deshabilitado (MERITOP_ENABLED=false)'),
      { code: 'MERITOP_DISABLED' }
    );
  }

  // Modo mock: sin red interna del banco, simula respuesta exitosa
  if (process.env.MERITOP_MOCK === 'true') {
    console.log('[Meritop MOCK] verifyMobilePayment →', { sourcePhoneNumber, bankCode, amount, paidOn });
    return _mockResponse({ sourcePhoneNumber, bankCode, amount });
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await _getToken(attempt > 1);

    let res;
    try {
      res = await axios.post(
        `${baseUrl}/payment/verifymobilepayment`,
        {
          SourcePhoneNumber : sourcePhoneNumber,
          BankCode          : bankCode,
          Amount            : amount,
          PaidOn            : paidOn,
        },
        {
          headers: {
            'Authorization' : `bearer ${token}`,
            'Content-Type'  : 'application/json',
          },
          timeout,
        }
      );
    } catch (err) {
      const status  = err.response?.status;
      const data    = err.response?.data || {};
      const errCode = String(data.code || '');
      const errMsg  = data.message || err.message;

      // 401 → token expirado → refrescar en segundo intento
      if (status === 401 && attempt === 1) {
        _tokenCache = { token: null, expiresAt: null };
        continue;
      }

      // 400 → errores de negocio/parámetros
      if (status === 400) {
        const friendlyMsg = RESULT_CODES[errCode] || errMsg;
        throw Object.assign(new Error(friendlyMsg), {
          code     : `MERITOP_${errCode || 'BAD_REQUEST'}`,
          baCode   : errCode,
          baMessage: errMsg,
        });
      }

      // Error de red (VPN caída, IP no alcanzable)
      if (!err.response) {
        throw Object.assign(
          new Error('No se pudo conectar con Meritop. Verifica la VPN o la red interna del banco.'),
          { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message }
        );
      }

      throw Object.assign(
        new Error(`Error inesperado de Meritop (HTTP ${status}): ${errMsg}`),
        { code: 'MERITOP_UNEXPECTED_ERROR' }
      );
    }

    const d = res.data;
    return {
      isVerified     : Boolean(d.isverified),
      reference      : d.bankreference  || null,
      verifiedAmount : d.verifiedAmount ?? null,
      verifiedOn     : d.verifiedOn     || null,
      message        : d.message        || '',
      code           : 'B010',
    };
  }

  throw Object.assign(
    new Error('No se pudo autenticar con Meritop tras dos intentos'),
    { code: 'MERITOP_AUTH_RETRY_FAILED' }
  );
}

module.exports = { verifyMobilePayment, RESULT_CODES };
