/**
 * Cliente Banco Activo — Verificación de Pago Móvil vía SysIP La Mundial
 *
 * NO usa Meritop directo (srv001 no tiene ruta VPN al banco).
 * Solo consulta el proxy de La Mundial:
 *
 *   POST {LAMUNDIAL_PAYMENTS_URL}{LAMUNDIAL_PAYMENTS_PATH}
 *
 * Rutas en SysIP main:
 *   /api/v1/external/payments/bancoActivo/find-mobile-pay  (Swagger, requiere apikey)
 *   /api/v1/payments/bancoActivo/find-mobile-pay           (alternativa QA)
 *
 * Payload:
 *   { xtelefono, cbanco_ref, cbanco_dest, mmonto, cci_rif, telefono_dest, fmovimiento }
 */

const axios = require('axios');

const DEFAULT_TIMEOUT    = 20_000;
const DEFAULT_DEST_PHONE = '04143966962';
const DEFAULT_DEST_BANCO = '0171';
const DEFAULT_BASE_URL   = 'https://qaapisys2000.lamundialdeseguros.com';

const PATH_EXTERNAL = '/api/v1/external/payments/bancoActivo/find-mobile-pay';
const PATH_PAYMENTS = '/api/v1/payments/bancoActivo/find-mobile-pay';

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

/** Resuelve rutas a probar (env explícita → external → payments). */
function _resolvePaths() {
  const custom = (process.env.LAMUNDIAL_PAYMENTS_PATH || '').trim();
  if (custom) return [custom.startsWith('/') ? custom : `/${custom}`];
  return [PATH_EXTERNAL, PATH_PAYMENTS];
}

/** URL principal (health/diagnóstico). */
function getVerifyMobileTargetUrl() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return `${baseUrl}${_resolvePaths()[0]}`;
}

function _isFastifyRouteNotFound(status, data) {
  const msg = String(data?.message || '');
  return status === 404 && (data?.statusCode === 404 || msg.startsWith('Route POST:'));
}

function _getConfig() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

  if (/:3002(?:\/|$)/.test(baseUrl)) {
    throw Object.assign(
      new Error('LAMUNDIAL_PAYMENTS_URL apunta a nest-api (:3002). Usar SysIP La Mundial.'),
      { code: 'MERITOP_MISCONFIGURED' }
    );
  }

  return {
    baseUrl,
    paths    : _resolvePaths(),
    apiKey   : (process.env.LAMUNDIAL_PAYMENTS_API_KEY || '').trim(),
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
  const { baseUrl, paths, apiKey, destPhone, destBanco, timeout, enabled, mock } = _getConfig();

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

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { apikey: apiKey, 'api-key': apiKey } : {}),
  };

  let lastRes = null;
  let lastUrl = null;

  for (const path of paths) {
    lastUrl = `${baseUrl}${path}`;
    console.log('[BancoActivo] → POST', lastUrl, apiKey ? 'apikey=***' : 'sin apikey', JSON.stringify(payload));

    try {
      lastRes = await axios.post(lastUrl, payload, {
        headers,
        timeout,
        validateStatus: () => true,
      });
    } catch (err) {
      throw Object.assign(
        new Error('No se pudo conectar con SysIP La Mundial. Verifica la red interna.'),
        { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message, targetUrl: lastUrl, payload }
      );
    }

    const d = lastRes.data || {};
    console.log('[BancoActivo] ← HTTP', lastRes.status, JSON.stringify(d));

    if (_isFastifyRouteNotFound(lastRes.status, d)) continue;

    if (lastRes.status === 401) {
      throw Object.assign(
        new Error(d.message || 'API Key inválida o faltante en SysIP La Mundial.'),
        { code: 'MERITOP_INVALID_APIKEY', baMessage: d.message, targetUrl: lastUrl, payload }
      );
    }

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
    new Error(`SysIP La Mundial en ${baseUrl} no expone find-mobile-pay.`),
    {
      code: 'MERITOP_MISCONFIGURED',
      targetUrl: lastUrl,
      payload,
      upstreamStatus: lastRes?.status,
      baMessage: lastRes?.data?.message,
    }
  );
}

module.exports = { verifyMobilePayment, getVerifyMobileTargetUrl, RESULT_CODES };
