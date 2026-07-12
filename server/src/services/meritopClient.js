/**
 * Cliente Banco Activo — Verificación de Pago Móvil
 *
 * Estrategia (PAYMENTS_VERIFY_MODE=auto por defecto):
 *   1. SysIP La Mundial → find-mobile-pay (rutas external y payments)
 *   2. Fallback Meritop directo → login + verifymobilepayment
 *
 * Payload La Mundial:
 *   POST {LAMUNDIAL_PAYMENTS_URL}/api/v1/external/payments/bancoActivo/find-mobile-pay
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

let _meritopTokenCache = { token: null, expiresAt: null };

/** URL principal La Mundial (health/diagnóstico). */
function getVerifyMobileTargetUrl() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || 'http://172.30.149.75:3000').replace(/\/$/, '');
  return `${baseUrl}${LAMUNDIAL_PATHS[0]}`;
}

function _isFastifyRouteNotFound(status, data) {
  const msg = String(data?.message || '');
  return status === 404 && (data?.statusCode === 404 || msg.startsWith('Route POST:'));
}

function _getLaMundialConfig() {
  const baseUrl = (process.env.LAMUNDIAL_PAYMENTS_URL || 'http://172.30.149.75:3000').replace(/\/$/, '');

  if (/:3002(?:\/|$)/.test(baseUrl)) {
    throw Object.assign(
      new Error('LAMUNDIAL_PAYMENTS_URL apunta a nest-api (:3002). Usar http://172.30.149.75:3000'),
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

function _getMeritopDirectConfig() {
  const host = (process.env.MERITOP_URL2 || 'http://172.30.149.18:9040').replace(/\/$/, '');
  return {
    baseUrl : `${host}/APIs-ProxiesCore/api`,
    apiKey  : process.env.MERITOP_APIKEY || '',
    enabled : process.env.MERITOP_ENABLED !== 'false',
    timeout : Number(process.env.MERITOP_TIMEOUT || DEFAULT_TIMEOUT),
  };
}

function _verifyMode() {
  const mode = (process.env.PAYMENTS_VERIFY_MODE || 'auto').toLowerCase();
  if (['auto', 'lamundial', 'meritop'].includes(mode)) return mode;
  return 'auto';
}

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
    via           : 'mock',
  };
}

function _pickFields(inner) {
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
    verifiedAmount: pick('verifiedAmount', 'verifiedamount', 'Amount', 'monto', 'amount') ?? null,
    verifiedOn    : pick('verifiedOn', 'verifiedon', 'FechaMovimiento', 'fmovimiento') ?? null,
    message       : pick('message') ?? 'Pago verificado',
    code          : baCode,
    raw           : inner,
  };
}

function _normalizeLaMundialPayload({ sourcePhoneNumber, bankCode, amount, paidOn, cci_rif, destPhone, destBanco }) {
  const xtelefono = String(sourcePhoneNumber).replace(/\s/g, '').replace(/^0/, '58');
  const fmovimiento = String(paidOn).split('T')[0];
  return {
    xtelefono,
    cbanco_ref   : String(bankCode).trim(),
    cbanco_dest  : destBanco,
    mmonto       : Number(parseFloat(amount).toFixed(2)),
    cci_rif      : cci_rif ? String(cci_rif).trim() : '',
    telefono_dest: destPhone,
    fmovimiento,
  };
}

/**
 * POST find-mobile-pay en SysIP La Mundial; prueba rutas external y payments.
 */
async function _verifyViaLaMundial({ sourcePhoneNumber, bankCode, amount, paidOn, cci_rif }) {
  const { baseUrl, apiKey, destPhone, destBanco, timeout } = _getLaMundialConfig();
  const payload = _normalizeLaMundialPayload({
    sourcePhoneNumber, bankCode, amount, paidOn, cci_rif, destPhone, destBanco,
  });

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

    const result = _pickFields(d.data || d.result || d);
    result.verifiedAmount = result.verifiedAmount ?? amount;
    result.verifiedOn = result.verifiedOn ?? payload.fmovimiento;
    result.via = 'lamundial';
    result.targetUrl = lastUrl;
    return result;
  }

  throw Object.assign(
    new Error(
      'SysIP La Mundial no expone find-mobile-pay (404 en rutas external y payments). ' +
      'Se intentará Meritop directo si MERITOP_APIKEY está configurado.'
    ),
    {
      code: 'LAMUNDIAL_ROUTE_NOT_FOUND',
      targetUrl: lastUrl,
      payload,
      triedUrls,
      upstreamStatus: lastRes?.status,
      baMessage: lastRes?.data?.message,
    }
  );
}

async function _getMeritopToken(forceRefresh = false) {
  const { baseUrl, apiKey, timeout } = _getMeritopDirectConfig();
  if (!apiKey) {
    throw Object.assign(new Error('MERITOP_APIKEY no configurado'), { code: 'MERITOP_MISSING_APIKEY' });
  }

  const valid = _meritopTokenCache.token && _meritopTokenCache.expiresAt
    && new Date(_meritopTokenCache.expiresAt).getTime() - 60_000 > Date.now();
  if (!forceRefresh && valid) return _meritopTokenCache.token;

  let res;
  try {
    res = await axios.post(`${baseUrl}/login`, {}, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout,
    });
  } catch (err) {
    if (!err.response) {
      throw Object.assign(
        new Error('No se pudo conectar con Meritop directo. Verifica VPN/red del banco.'),
        { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message }
      );
    }
    throw Object.assign(
      new Error(err.response?.data?.message || 'Error al autenticar con Meritop'),
      { code: 'MERITOP_AUTH_ERROR' }
    );
  }

  _meritopTokenCache = { token: res.data.token, expiresAt: res.data.expiresAt };
  return _meritopTokenCache.token;
}

/**
 * Fallback: Meritop directo (login + verifymobilepayment).
 */
async function _verifyViaMeritopDirect({ sourcePhoneNumber, bankCode, amount, paidOn }) {
  const { baseUrl, timeout } = _getMeritopDirectConfig();
  const phone = String(sourcePhoneNumber).replace(/\s/g, '');
  const paidOnIso = String(paidOn).includes('T') ? paidOn : `${String(paidOn).split('T')[0]}T12:00:00`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await _getMeritopToken(attempt > 1);
    const url = `${baseUrl}/payment/verifymobilepayment`;
    const body = {
      SourcePhoneNumber: phone,
      BankCode         : String(bankCode).trim(),
      Amount           : amount,
      PaidOn           : paidOnIso,
    };

    console.log('[Meritop] → POST', url, JSON.stringify(body));

    let res;
    try {
      res = await axios.post(url, body, {
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        timeout,
        validateStatus: () => true,
      });
    } catch (err) {
      throw Object.assign(
        new Error('No se pudo conectar con Meritop directo.'),
        { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message, targetUrl: url }
      );
    }

    console.log('[Meritop] ← HTTP', res.status, JSON.stringify(res.data || {}));

    if (res.status === 401 && attempt === 1) {
      _meritopTokenCache = { token: null, expiresAt: null };
      continue;
    }

    if (res.status === 401) {
      throw Object.assign(new Error('Token Meritop inválido'), { code: 'MERITOP_AUTH_ERROR' });
    }

    if (res.status === 400 || res.status === 404) {
      const nested = res.data?.error && typeof res.data.error === 'object' ? res.data.error : res.data || {};
      const errCode = String(nested.code || res.data?.code || '');
      const errMsg = nested.message || res.data?.message || 'Error Meritop';
      throw Object.assign(new Error(RESULT_CODES[errCode] || errMsg), {
        code: `MERITOP_${errCode || 'BAD_REQUEST'}`,
        baCode: errCode || null,
        baMessage: errMsg,
        targetUrl: url,
      });
    }

    if (res.status >= 400) {
      throw Object.assign(
        new Error(res.data?.message || `Error Meritop HTTP ${res.status}`),
        { code: `MERITOP_${res.status}`, targetUrl: url }
      );
    }

    const result = _pickFields(res.data || {});
    result.verifiedAmount = result.verifiedAmount ?? amount;
    result.via = 'meritop-direct';
    result.targetUrl = url;
    return result;
  }

  throw Object.assign(new Error('No se pudo autenticar con Meritop'), { code: 'MERITOP_AUTH_RETRY_FAILED' });
}

async function verifyMobilePayment(params) {
  const { enabled, mock } = _getLaMundialConfig();
  const mode = _verifyMode();

  if (!enabled) {
    throw Object.assign(
      new Error('Verificación de pago móvil deshabilitada (LAMUNDIAL_PAYMENTS_ENABLED=false)'),
      { code: 'MERITOP_DISABLED' }
    );
  }

  if (mock) {
    console.log('[BancoActivo MOCK] verifyMobilePayment →', params);
    return _mockResponse(params);
  }

  if (mode === 'meritop') {
    return _verifyViaMeritopDirect(params);
  }

  if (mode === 'lamundial') {
    return _verifyViaLaMundial(params);
  }

  // auto: La Mundial primero, Meritop directo si ruta no existe
  try {
    return await _verifyViaLaMundial(params);
  } catch (err) {
    if (err.code !== 'LAMUNDIAL_ROUTE_NOT_FOUND') throw err;

    const meritopCfg = _getMeritopDirectConfig();
    if (!meritopCfg.enabled || !meritopCfg.apiKey) {
      throw Object.assign(
        new Error(
          'SysIP La Mundial sin ruta find-mobile-pay y MERITOP_APIKEY no disponible para fallback.'
        ),
        { code: 'MERITOP_MISCONFIGURED', triedUrls: err.triedUrls, targetUrl: err.targetUrl, payload: err.payload }
      );
    }

    console.log('[BancoActivo] La Mundial 404 → fallback Meritop directo');
    return _verifyViaMeritopDirect(params);
  }
}

module.exports = { verifyMobilePayment, getVerifyMobileTargetUrl, RESULT_CODES };
