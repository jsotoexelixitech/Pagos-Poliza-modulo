/**
 * Cliente Banco Activo — Verificación de Pago Móvil vía SysIP La Mundial
 *
 * NO usa Meritop directo (srv001 no tiene ruta VPN al banco).
 * Solo consulta el proxy de La Mundial:
 *
 *   POST {LAMUNDIAL_PAYMENTS_URL}/api/v1/external/payments/bancoActivo/find-mobile-pay
 *   POST {LAMUNDIAL_PAYMENTS_URL}/api/v1/payments/bancoActivo/find-mobile-pay  (fallback)
 *
 * Payload:
 *   { xtelefono, cbanco_ref, cbanco_dest, mmonto, cci_rif, telefono_dest, fmovimiento }
 */

const axios = require('axios');

const DEFAULT_TIMEOUT    = 20_000;
const DEFAULT_DEST_PHONE = '04143966962';
const DEFAULT_DEST_BANCO = '0171';

const LAMUNDIAL_PATHS = [
  '/api/v1/external/payments/bancoActivo/find-mobile-pay',
  '/api/v1/payments/bancoActivo/find-mobile-pay',
];

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

/** URL principal (health/diagnóstico). */
function getVerifyMobileTargetUrl() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || 'http://172.30.149.75:3000').replace(/\/$/, '');
  return `${baseUrl}${LAMUNDIAL_PATHS[0]}`;
}

function _isFastifyRouteNotFound(status, data) {
  const msg = String(data?.message || '');
  return status === 404 && (data?.statusCode === 404 || msg.startsWith('Route POST:'));
}

function _getConfig() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || 'http://172.30.149.75:3000').replace(/\/$/, '');

  if (/:3002(?:\/|$)/.test(baseUrl)) {
    throw Object.assign(
      new Error('LAMUNDIAL_PAYMENTS_URL apunta a nest-api (:3002). Usar SysIP La Mundial.'),
      { code: 'MERITOP_MISCONFIGURED' }
    );
  }

  return {
    baseUrl,
    apiKey   : process.env.LAMUNDIAL_PAYMENTS_API_KEY || process.env.LAMUNDIAL_APIKEY || '',
    destPhone: process.env.LAMUNDIAL_PAYMENTS_DEST_PHONE || DEFAULT_DEST_PHONE,
    destBanco: process.env.LAMUNDIAL_PAYMENTS_DEST_BANCO || DEFAULT_DEST_BANCO,
    timeout  : Number(process.env.LAMUNDIAL_PAYMENTS_TIMEOUT || DEFAULT_TIMEOUT),
    enabled  : process.env.LAMUNDIAL_PAYMENTS_ENABLED !== 'false',
    mock     : process.env.LAMUNDIAL_PAYMENTS_MOCK === 'true',
  };
}

function _mockResponse({ amount }) {
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

function _pickFields(inner, amount, fmovimiento) {
  const pick = (...keys) => {
    for (const k of keys) {
      const match = Object.keys(inner).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (match !== undefined && inner[match] !== undefined && inner[match] !== null) {
        return inner[match];
      }
    }
    return undefined;
  };

  const baCode = String(pick('code') ?? 'B010').toUpperCase();
  const flagRaw = pick('isVerified', 'verified', 'isverified');
  const flag = typeof flagRaw === 'boolean'
    ? flagRaw
    : flagRaw === 'true' || flagRaw === 1 || flagRaw === '1';
  const isVerified = baCode === 'B010' || (flag && baCode !== 'B000');

  return {
    isVerified,
    reference     : pick('bankReference', 'bankreference', 'NroReferencia', 'reference', 'referencia') ?? null,
    verifiedAmount: pick('verifiedAmount', 'verifiedamount', 'Amount', 'monto', 'amount') ?? amount,
    verifiedOn    : pick('verifiedOn', 'verifiedon', 'FechaMovimiento', 'fmovimiento') ?? fmovimiento,
    message       : pick('message') ?? 'Pago verificado',
    code          : baCode,
    raw           : inner,
  };
}

/**
 * Verifica pago móvil exclusivamente vía SysIP La Mundial.
 */
async function verifyMobilePayment({ sourcePhoneNumber, bankCode, amount, paidOn, cci_rif }) {
  const { baseUrl, apiKey, destPhone, destBanco, timeout, enabled, mock } = _getConfig();

  if (!enabled) {
    throw Object.assign(
      new Error('Verificación deshabilitada (LAMUNDIAL_PAYMENTS_ENABLED=false)'),
      { code: 'MERITOP_DISABLED' }
    );
  }

  if (mock) {
    return _mockResponse({ amount });
  }

  const xtelefono = String(sourcePhoneNumber).replace(/\s/g, '').replace(/^0/, '58');
  const fmovimiento = String(paidOn).split('T')[0];
  const payload = {
    xtelefono,
    cbanco_ref   : String(bankCode).trim(),
    cbanco_dest  : destBanco,
    mmonto       : Number(parseFloat(amount).toFixed(2)),
    cci_rif      : cci_rif ? String(cci_rif).trim() : '',
    telefono_dest: destPhone,
    fmovimiento,
  };

  const triedUrls = [];
  let lastRes = null;
  let lastUrl = null;

  for (const path of LAMUNDIAL_PATHS) {
    lastUrl = `${baseUrl}${path}`;
    triedUrls.push(lastUrl);
    console.log('[BancoActivo] → POST', lastUrl, JSON.stringify(payload));

    try {
      lastRes = await axios.post(lastUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { apikey: apiKey } : {}),
        },
        timeout,
        validateStatus: () => true,
      });
    } catch (err) {
      throw Object.assign(
        new Error('No se pudo conectar con SysIP La Mundial. Verifica la red interna.'),
        { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message, targetUrl: lastUrl, payload, triedUrls }
      );
    }

    const d = lastRes.data || {};
    console.log('[BancoActivo] ← HTTP', lastRes.status, JSON.stringify(d));

    if (_isFastifyRouteNotFound(lastRes.status, d)) continue;

    const statusOk = d.status === true || d.success === true;
    if (lastRes.status >= 400 || !statusOk) {
      const errMsg  = d.message || d.error || `Error HTTP ${lastRes.status}`;
      const errCode = d.code || String(lastRes.status);
      throw Object.assign(
        new Error(RESULT_CODES[errCode] || errMsg),
        { code: `MERITOP_${errCode}`, baCode: errCode, baMessage: errMsg, targetUrl: lastUrl, payload }
      );
    }

    const result = _pickFields(d.data || d.result || d, amount, fmovimiento);
    result.targetUrl = lastUrl;
    return result;
  }

  throw Object.assign(
    new Error(
      'SysIP La Mundial no tiene la ruta find-mobile-pay activa. ' +
      'Contactar a La Mundial para restaurar el endpoint en ' + baseUrl
    ),
    {
      code: 'MERITOP_MISCONFIGURED',
      targetUrl: lastUrl,
      triedUrls,
      payload,
      upstreamStatus: lastRes?.status,
      baMessage: lastRes?.data?.message,
    }
  );
}

module.exports = { verifyMobilePayment, getVerifyMobileTargetUrl, RESULT_CODES };
