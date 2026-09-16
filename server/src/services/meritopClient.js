/**
 * Cliente Meritop — Verificación de Pago Móvil vía SysIP La Mundial
 *
 * NO usa Meritop directo (srv001 no tiene ruta VPN al banco).
 * Consulta el proxy de La Mundial:
 *
 *   POST {LAMUNDIAL_PAYMENTS_URL}{LAMUNDIAL_PAYMENTS_PATH}
 *
 * Ruta por defecto (misma que SysIP front):
 *   /api/v1/bancamiga/meritop/find-mobile-pay
 *
 * Payload (igual que bancamiga-mobile-pay.component.ts):
 *   { xtelefono, cbanco_ref, cbanco_dest, mmonto, cci_rif, telefono_dest, fmovimiento }
 */

const axios = require('axios');

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_DEST_PHONE = '04143966962';
const DEFAULT_DEST_BANCO = '0171';
const DEFAULT_PROD_URL = 'https://apisys2000.lamundialdeseguros.com';
const DEFAULT_QA_URL = 'https://qaapisys2000.lamundialdeseguros.com';
const DEFAULT_API_KEY = '5e37ff49cba628dd0000842716f801e166eb20624f3b6b9f72c22da5d391ba6f';

const PATH_MERITOP = '/api/v1/bancamiga/meritop/find-mobile-pay';
const PATH_EXTERNAL = '/api/v1/external/payments/bancoActivo/find-mobile-pay';
const PATH_PAYMENTS = '/api/v1/payments/bancoActivo/find-mobile-pay';
const PATH_BANCAMIGA = '/api/v1/bancamiga/find-mobile-pay';

const RESULT_CODES = {
  B000: 'Transacción encontrada (pago ya usado por el cliente)',
  B001: 'Transacción no encontrada',
  B002: 'Transacción duplicada (pago ya registrado para una compra)',
  B003: 'Error de parámetros (algún campo vacío)',
  B004: 'Error de conexión con el Gateway',
  B005: 'Error de conexión Gateway-AS400',
  B010: 'Transacción encontrada y disponible',
  701: 'Faltan parámetros requeridos',
  750: 'Número de teléfono inválido',
  751: 'Código de banco inválido',
  752: 'Monto inválido',
  753: 'Fecha de pago inválida',
  210: 'Error interno del proveedor',
};

/** Resuelve rutas a probar: prioriza Meritop/Banco Activo sobre Bancamiga. */
function _resolvePaths() {
  const custom = (process.env.LAMUNDIAL_PAYMENTS_PATH || '').trim();
  if (custom) return [custom.startsWith('/') ? custom : `/${custom}`];
  return [PATH_MERITOP, PATH_EXTERNAL, PATH_PAYMENTS, PATH_BANCAMIGA];
}

/** Resuelve servidores base a probar con fallback automático. */
function _resolveBaseUrls() {
  const configured = (process.env.LAMUNDIAL_PAYMENTS_URL || '').trim().replace(/\/$/, '');
  const urls = [];
  if (configured) urls.push(configured);
  // En QA/desarrollo, o si está configurado apisys2000 (producción que puede bloquear IPs externas), incluir qaapisys2000
  if (!urls.includes(DEFAULT_QA_URL)) {
    if (!configured || configured === DEFAULT_PROD_URL) {
      urls.unshift(DEFAULT_QA_URL);
    } else {
      urls.push(DEFAULT_QA_URL);
    }
  }
  if (!urls.includes(DEFAULT_PROD_URL)) {
    urls.push(DEFAULT_PROD_URL);
  }
  return urls;
}

/** URL principal (health/diagnóstico). */
function getVerifyMobileTargetUrl() {
  const baseUrls = _resolveBaseUrls();
  return `${baseUrls[0]}${_resolvePaths()[0]}`;
}

function _cleanMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object') {
    if (typeof msg.mensaje === 'string') return msg.mensaje;
    if (typeof msg.message === 'string') return msg.message;
    if (typeof msg.error === 'string') return msg.error;
    try { return JSON.stringify(msg); } catch { return String(msg); }
  }
  return String(msg);
}

function _isFastifyRouteNotFound(status, data) {
  const msg = String(data?.message || '');
  return status === 404 && (data?.statusCode === 404 || msg.startsWith('Route POST:'));
}

function _getConfig() {
  const baseUrls = _resolveBaseUrls();

  for (const u of baseUrls) {
    if (/:3002(?:\/|$)/.test(u)) {
      throw Object.assign(
        new Error('LAMUNDIAL_PAYMENTS_URL apunta a nest-api (:3002). Usar SysIP La Mundial.'),
        { code: 'MERITOP_MISCONFIGURED' }
      );
    }
  }

  return {
    baseUrls,
    paths: _resolvePaths(),
    apiKey: (process.env.LAMUNDIAL_PAYMENTS_API_KEY || DEFAULT_API_KEY).trim(),
    destPhone: process.env.LAMUNDIAL_PAYMENTS_DEST_PHONE || DEFAULT_DEST_PHONE,
    destBanco: process.env.LAMUNDIAL_PAYMENTS_DEST_BANCO || DEFAULT_DEST_BANCO,
    timeout: Number(process.env.LAMUNDIAL_PAYMENTS_TIMEOUT || DEFAULT_TIMEOUT),
    enabled: process.env.LAMUNDIAL_PAYMENTS_ENABLED !== 'false',
    mock: process.env.LAMUNDIAL_PAYMENTS_MOCK === 'true',
  };
}

function _mockResponse({ amount }) {
  const ref = 'REF' + Date.now().toString().slice(-9);
  const verifiedOn = new Date().toISOString();
  return {
    isVerified: true,
    reference: ref,
    verifiedAmount: amount,
    verifiedOn,
    message: 'Transacción encontrada y disponible [MODO PRUEBA]',
    code: 'B010',
    raw: { isVerified: true, bankReference: ref, verifiedAmount: amount, verifiedOn },
  };
}

function _pickFields(inner, amount, fmovimiento) {
  const safeInner = inner && typeof inner === 'object' ? inner : {};
  const pick = (...keys) => {
    for (const k of keys) {
      const match = Object.keys(safeInner).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (match !== undefined && safeInner[match] !== undefined && safeInner[match] !== null) {
        return safeInner[match];
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
    reference: pick('bankReference', 'bankreference', 'NroReferencia', 'reference', 'referencia') ?? null,
    verifiedAmount: pick('verifiedAmount', 'verifiedamount', 'Amount', 'monto', 'amount') ?? amount,
    verifiedOn: pick('verifiedOn', 'verifiedon', 'FechaMovimiento', 'fmovimiento') ?? fmovimiento,
    message: pick('message') ?? 'Pago verificado',
    code: baCode,
    raw: safeInner,
  };
}

/**
 * Verifica pago móvil exclusivamente vía SysIP La Mundial.
 */
async function verifyMobilePayment({ sourcePhoneNumber, bankCode, amount, paidOn, cci_rif }) {
  const { baseUrls, paths, apiKey, destPhone, destBanco, timeout, enabled, mock } = _getConfig();

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
  let formattedRif = cci_rif ? String(cci_rif).trim().toUpperCase() : '';
  if (formattedRif && /^[VEJPG]\d+$/.test(formattedRif)) {
    formattedRif = `${formattedRif[0]}-${formattedRif.slice(1)}`;
  }

  const payload = {
    xtelefono,
    cbanco_ref: String(bankCode).trim(),
    cbanco_dest: destBanco,
    mmonto: Number(parseFloat(amount).toFixed(2)),
    cci_rif: formattedRif,
    telefono_dest: destPhone,
    fmovimiento,
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { apikey: apiKey, 'x-api-key': apiKey, 'api-key': apiKey } : {}),
  };

  let lastRes = null;
  let lastUrl = null;
  let lastError = null;

  for (const baseUrl of baseUrls) {
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
        console.warn(`[BancoActivo] Fallo de conexión con ${lastUrl}:`, err.message);
        lastError = Object.assign(
          new Error('No se pudo conectar con SysIP La Mundial. Verifica la red interna.'),
          { code: 'MERITOP_CONNECTION_ERROR', originalError: err.message, targetUrl: lastUrl, payload }
        );
        continue;
      }

      const d = lastRes.data || {};
      console.log('[BancoActivo] ← HTTP', lastRes.status, JSON.stringify(d));

      if (_isFastifyRouteNotFound(lastRes.status, d)) continue;

      if (lastRes.status === 401) {
        lastError = Object.assign(
          new Error(_cleanMessage(d.message) || 'API Key inválida o faltante en SysIP La Mundial.'),
          { code: 'MERITOP_INVALID_APIKEY', baMessage: _cleanMessage(d.message), targetUrl: lastUrl, payload }
        );
        continue;
      }

      // Si el endpoint respondió 500 (p.ej. bancamiga sin token o falla puntual), intentar la siguiente ruta
      if (lastRes.status >= 500) {
        lastError = Object.assign(
          new Error(_cleanMessage(d.message || d.error) || `Error HTTP ${lastRes.status}`),
          { code: `MERITOP_${lastRes.status}`, baCode: String(lastRes.status), baMessage: _cleanMessage(d.message || d.error), targetUrl: lastUrl, payload }
        );
        continue;
      }

      const statusOk = d.status === true || d.success === true;
      if (lastRes.status >= 400 || !statusOk) {
        const rawMsg = _cleanMessage(d.message || d.error) || `Error HTTP ${lastRes.status}`;
        const errCode = d.code || String(lastRes.status);
        throw Object.assign(
          new Error(RESULT_CODES[errCode] || rawMsg),
          { code: `MERITOP_${errCode}`, baCode: errCode, baMessage: rawMsg, targetUrl: lastUrl, payload }
        );
      }

      const result = _pickFields(d.data || d.result || d, amount, fmovimiento);
      result.targetUrl = lastUrl;
      return result;
    }
  }

  if (lastError) throw lastError;

  throw Object.assign(
    new Error(`SysIP La Mundial (${baseUrls.join(', ')}) no expone find-mobile-pay.`),
    {
      code: 'MERITOP_MISCONFIGURED',
      targetUrl: lastUrl,
      payload,
      upstreamStatus: lastRes?.status,
      baMessage: _cleanMessage(lastRes?.data?.message),
    }
  );
}

module.exports = { verifyMobilePayment, getVerifyMobileTargetUrl, RESULT_CODES };
