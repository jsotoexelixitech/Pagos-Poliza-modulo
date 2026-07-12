/**
 * Cliente Banco Activo — Verificación de Pago Móvil
 *
 * Verifica pagos móviles interbancarios consultando el endpoint de
 * La Mundial (SysIP-backend) que actúa como proxy al banco.
 *
 * Endpoint:
 *   POST http://<LAMUNDIAL_PAYMENTS_URL>/api/v1/external/payments/bancoActivo/find-mobile-pay
 *
 * Payload enviado:
 *   {
 *     "xtelefono":    "584242050137",   // Teléfono origen con prefijo 58
 *     "cbanco_ref":   "0174",           // Código banco origen
 *     "cbanco_dest":  "0171",           // Código banco destino (Banco Activo)
 *     "mmonto":       1,                // Monto en Bs
 *     "cci_rif":      "V-19908817",     // RIF/Cédula del cliente
 *     "telefono_dest":"04143966962",    // Teléfono destino de La Mundial
 *     "fmovimiento":  "2026-06-15"      // Fecha del movimiento (YYYY-MM-DD)
 *   }
 *
 * Variables de entorno requeridas:
 *   LAMUNDIAL_PAYMENTS_URL  SysIP La Mundial (NO sysip-nest-api). Default QA:
 *                           https://qaapisys2000.lamundialdeseguros.com
 *   LAMUNDIAL_APIKEY        API Key para autenticación con SysIP La Mundial
 *
 * Variables de entorno opcionales:
 *   LAMUNDIAL_PAYMENTS_DEST_PHONE  Teléfono destino de La Mundial. Default: 04143966962
 *   LAMUNDIAL_PAYMENTS_DEST_BANCO  Código banco destino. Default: 0171
 *   LAMUNDIAL_PAYMENTS_TIMEOUT     Timeout HTTP en ms. Default: 20000
 *   LAMUNDIAL_PAYMENTS_MOCK        "true" activa modo prueba sin llamada real
 */

const axios = require('axios');

const DEFAULT_TIMEOUT     = 20_000;
const DEFAULT_DEST_PHONE  = '04143966962'; // Banco Activo — La Mundial
const DEFAULT_DEST_BANCO  = '0171';        // Banco Activo

// ── Códigos de resultado Banco Activo ─────────────────────────────────────
const RESULT_CODES = {
  B000: 'Transacción encontrada (pago ya usado por el cliente)',
  B001: 'Transacción no encontrada',
  B002: 'Transacción duplicada (pago ya registrado para una compra)',
  B003: 'Error de parámetros (algún campo vacío)',
  B004: 'Error de conexión con el Gateway',
  B005: 'Error de conexión Gateway-AS400',
  B010: 'Transacción encontrada y disponible',
  701:  'Faltan parámetros requeridos',
  750:  'Número de teléfono inválido',
  751:  'Código de banco inválido',
  752:  'Monto inválido',
  753:  'Fecha de pago inválida',
  210:  'Error interno del proveedor',
};

/** URL base de SysIP La Mundial (NO sysip-nest-api :3002). */
function _resolvePaymentsBaseUrl() {
  const explicit = (process.env.LAMUNDIAL_PAYMENTS_URL || '').replace(/\/$/, '');
  const sysipNest = (process.env.SYSIP_API_URL || '').replace(/\/$/, '');

  if (explicit) {
    const looksLikeNestApi =
      (sysipNest && explicit === sysipNest) ||
      /:3002(?:\/|$)/.test(explicit) ||
      explicit.includes('127.0.0.1:3002') ||
      explicit.includes('localhost:3002');

    if (looksLikeNestApi) {
      throw Object.assign(
        new Error(
          'LAMUNDIAL_PAYMENTS_URL apunta a sysip-nest-api (:3002). ' +
          'La verificación de pago móvil debe usar SysIP La Mundial ' +
          '(ej. https://qaapisys2000.lamundialdeseguros.com).'
        ),
        { code: 'MERITOP_MISCONFIGURED' }
      );
    }
    return explicit;
  }

  // Default: SysIP La Mundial QA (proxy Meritop/Banco Activo).
  return 'https://qaapisys2000.lamundialdeseguros.com';
}

function _getConfig() {
  const baseUrl = _resolvePaymentsBaseUrl();
  return {
    baseUrl,
    apiKey    : process.env.LAMUNDIAL_PAYMENTS_API_KEY || process.env.LAMUNDIAL_APIKEY || '',
    destPhone : process.env.LAMUNDIAL_PAYMENTS_DEST_PHONE || DEFAULT_DEST_PHONE,
    destBanco : process.env.LAMUNDIAL_PAYMENTS_DEST_BANCO || DEFAULT_DEST_BANCO,
    timeout   : Number(process.env.LAMUNDIAL_PAYMENTS_TIMEOUT || DEFAULT_TIMEOUT),
    enabled   : process.env.LAMUNDIAL_PAYMENTS_ENABLED !== 'false',
    mock      : process.env.LAMUNDIAL_PAYMENTS_MOCK === 'true',
  };
}

/**
 * Modo mock — simula una respuesta exitosa sin llamada real.
 * Actívalo con LAMUNDIAL_PAYMENTS_MOCK=true en .env.
 */
function _mockResponse({ sourcePhoneNumber, bankCode, amount }) {
  const ref = 'REF' + Date.now().toString().slice(-9);
  const verifiedOn = new Date().toISOString();
  return {
    isVerified    : true,
    reference     : ref,
    verifiedAmount: amount,
    verifiedOn,
    message       : 'Transacción encontrada y disponible [MODO PRUEBA]',
    code          : 'B010',
    raw           : { isVerified: true, bankReference: ref, verifiedAmount: amount, verifiedOn },
  };
}

/**
 * Verifica si un pago móvil interbancario es válido.
 *
 * @param {object} params
 * @param {string} params.sourcePhoneNumber  Teléfono de origen. Puede ser "04XXXXXXXXX" o "584XXXXXXXXX".
 * @param {string} params.bankCode           Código del banco emisor (ej. "0174").
 * @param {number} params.amount             Monto en bolívares.
 * @param {string} params.paidOn             Fecha del movimiento en formato "YYYY-MM-DD".
 * @param {string} params.cci_rif            RIF o cédula del cliente (ej. "V-19908817").
 *
 * @returns {Promise<{
 *   isVerified: boolean,
 *   reference: string|null,
 *   verifiedAmount: number|null,
 *   verifiedOn: string|null,
 *   message: string,
 *   code: string,
 *   raw: object
 * }>}
 */
async function verifyMobilePayment({ sourcePhoneNumber, bankCode, amount, paidOn, cci_rif }) {
  const { baseUrl, apiKey, destPhone, destBanco, timeout, enabled, mock } = _getConfig();

  if (!enabled) {
    throw Object.assign(
      new Error('La verificación de pago móvil está deshabilitada (LAMUNDIAL_PAYMENTS_ENABLED=false)'),
      { code: 'MERITOP_DISABLED' }
    );
  }

  if (mock) {
    console.log('[BancoActivo MOCK] verifyMobilePayment →', { sourcePhoneNumber, bankCode, amount, paidOn });
    return _mockResponse({ sourcePhoneNumber, bankCode, amount });
  }

  // Normalizar teléfono: "04XXXXXXXXX" → "584XXXXXXXXX"
  const xtelefono = String(sourcePhoneNumber)
    .replace(/\s/g, '')
    .replace(/^0/, '58');

  // Extraer solo la fecha YYYY-MM-DD (por si llega un ISO completo)
  const fmovimiento = String(paidOn).split('T')[0];

  const url     = `${baseUrl}/api/v1/external/payments/bancoActivo/find-mobile-pay`;
  const payload = {
    xtelefono,
    cbanco_ref  : String(bankCode).trim(),
    cbanco_dest : destBanco,
    mmonto      : Number(parseFloat(amount).toFixed(2)),
    cci_rif     : cci_rif ? String(cci_rif).trim() : '',
    telefono_dest: destPhone,
    fmovimiento,
  };

  console.log('[BancoActivo] → POST', url, JSON.stringify(payload));

  let res;
  try {
    res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      timeout,
      validateStatus: () => true, // Manejamos todos los status manualmente
    });
  } catch (err) {
    // Error de red (no hay respuesta)
    throw Object.assign(
      new Error('No se pudo conectar con el servicio de pagos. Verifica la red interna.'),
      { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message }
    );
  }

  const d = res.data || {};
  console.log('[BancoActivo] ← HTTP', res.status, JSON.stringify(d));

  // SysIP-backend devuelve { status: true/false, data: {...} } o { success: true/false, ... }
  const statusOk = d.status === true || d.success === true;

  if (res.status === 404) {
    throw Object.assign(
      new Error(
        'Ruta find-mobile-pay no encontrada. LAMUNDIAL_PAYMENTS_URL debe apuntar a SysIP La Mundial ' +
        '(https://qaapisys2000.lamundialdeseguros.com), no a sysip-nest-api (:3002).'
      ),
      { code: 'MERITOP_ROUTE_NOT_FOUND', baMessage: d.message || d.error || `HTTP ${res.status}` }
    );
  }

  if (res.status >= 400 || !statusOk) {
    const errMsg  = d.message || d.error || `Error HTTP ${res.status}`;
    const errCode = d.code || String(res.status);
    const friendly = RESULT_CODES[errCode] || errMsg;

    throw Object.assign(
      new Error(friendly),
      {
        code     : `MERITOP_${errCode}`,
        baCode   : errCode,
        baMessage: errMsg,
      }
    );
  }

  const inner = d.data || d.result || d;

  // Normalizar la referencia (los campos pueden variar según la respuesta del banco)
  const pick = (...keys) => {
    for (const k of keys) {
      const match = Object.keys(inner).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (match !== undefined && inner[match] !== undefined && inner[match] !== null) {
        return inner[match];
      }
    }
    return undefined;
  };

  const baCode  = String(pick('code') ?? 'B010').toUpperCase();
  const flagRaw = pick('isVerified', 'verified', 'isverified');
  const flag    = typeof flagRaw === 'boolean'
    ? flagRaw
    : flagRaw === 'true' || flagRaw === 1 || flagRaw === '1';

  // B010 = transacción disponible → válida.
  // B000 = ya usada anteriormente → rechazada.
  const isVerified = baCode === 'B010' || (flag && baCode !== 'B000');

  return {
    isVerified,
    reference     : pick('bankReference', 'bankreference', 'NroReferencia', 'reference', 'referencia') ?? null,
    verifiedAmount : pick('verifiedAmount', 'verifiedamount', 'Amount', 'monto', 'amount') ?? amount,
    verifiedOn     : pick('verifiedOn', 'verifiedon', 'FechaMovimiento', 'fmovimiento') ?? fmovimiento,
    message        : pick('message') ?? 'Pago verificado',
    code           : baCode,
    raw            : inner,
  };
}

module.exports = { verifyMobilePayment, RESULT_CODES };
