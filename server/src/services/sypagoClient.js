/**
 * sypagoClient.js
 *
 * Cliente para la API de SyPago — Débito OTP.
 *
 * Flujo de dos pasos:
 *   1. requestOtp()   → POST /api/v1/request/otp
 *      El banco del cliente le envía una clave OTP por SMS / Push / Email.
 *
 *   2. confirmOtp()   → POST /api/v1/transaction/otp
 *      Se envía la OTP junto con los datos de la transacción.
 *      La API responde con { transaction_id, operation_secret }.
 *
 *   3. getStatus()    → GET /api/v1/transaction/:id
 *      Consulta el estado de la transacción (polling).
 *
 * Autenticación: JWT fijo (SYPAGO_BEARER_TOKEN) — no requiere solicitar token.
 * Si se prefiere auth dinámica, agregar SYPAGO_CLIENT_ID + SYPAGO_SECRET.
 *
 * Variables de entorno requeridas:
 *   SYPAGO_URL            Base URL de la API
 *   SYPAGO_BEARER_TOKEN   JWT de acceso (fijo o dinámico ya obtenido)
 *   SYPAGO_BANK_CODE      Código del banco acreedor (el de La Mundial)
 *   SYPAGO_TYPE           Tipo de cuenta (CNTA)
 *   SYPAGO_NUMBER         Número de cuenta acreedor (20 dígitos)
 *   SYPAGO_WEBHOOK_URL    URL donde SyPago notifica el resultado final (opcional en dev)
 *   SYPAGO_MOCK           "true" para simular sin red (default: false)
 *   SYPAGO_TIMEOUT        Timeout HTTP en ms (default: 20000)
 */

'use strict';

const axios  = require('axios');
const crypto = require('crypto');

const DEFAULT_TIMEOUT = 20_000;

// Estados oficiales de transacción (campo `status` en la mensajería SyPago).
const STATUS_MAP = {
  PEND: { label: 'Pendiente',  state: 'pending'  },
  PROC: { label: 'En proceso', state: 'pending'  },
  ACCP: { label: 'Aceptado',   state: 'approved' },
  RJCT: { label: 'Rechazado',  state: 'rejected' },
  CANC: { label: 'Cancelado',  state: 'rejected' },
};

/** Normaliza el código de estado de SyPago a { code, label, state }. */
function normalizeStatus(raw) {
  const code = String(raw || '').toUpperCase();
  const map  = STATUS_MAP[code] || { label: code || 'Desconocido', state: 'pending' };
  return { code, ...map };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getConfig() {
  return {
    baseUrl      : (process.env.SYPAGO_URL || 'https://pruebas.api.sypago.net').replace(/\/$/, ''),
    bearerToken  : process.env.SYPAGO_BEARER_TOKEN || '',   // JWT fijo (sin expiración)
    clientId     : process.env.SYPAGO_CLIENT_ID || '',      // API Key dinámica
    secret       : process.env.SYPAGO_SECRET || '',
    bankCode     : process.env.SYPAGO_BANK_CODE || '',
    accountType  : process.env.SYPAGO_TYPE || 'CNTA',
    accountNumber: process.env.SYPAGO_NUMBER || '',
    webhookUrl   : process.env.SYPAGO_WEBHOOK_URL || '',
    publicKey    : (process.env.SYPAGO_WEBHOOK_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    mock         : process.env.SYPAGO_MOCK === 'true',
    timeout      : parseInt(process.env.SYPAGO_TIMEOUT, 10) || DEFAULT_TIMEOUT,
  };
}

// ── Autenticación ───────────────────────────────────────────────────────────
// SyPago soporta dos modalidades:
//   1) JWT fijo (SYPAGO_BEARER_TOKEN) → se envía directo en el Bearer.
//   2) API Key dinámica (client_id + secret) → POST /api/v1/auth/token → access_token.
let _tokenCache = { token: null, expiresAt: 0 };

async function _getAccessToken(cfg) {
  if (cfg.bearerToken) return cfg.bearerToken;

  if (!cfg.clientId || !cfg.secret) {
    throw Object.assign(
      new Error('Falta SYPAGO_BEARER_TOKEN (token fijo) o SYPAGO_CLIENT_ID + SYPAGO_SECRET (API Key dinámica).'),
      { code: 'SYPAGO_MISSING_TOKEN' }
    );
  }

  // Reusar token cacheado si sigue vigente (margen de 60 s).
  if (_tokenCache.token && _tokenCache.expiresAt - 60_000 > Date.now()) {
    return _tokenCache.token;
  }

  try {
    const resp = await axios.post(
      `${cfg.baseUrl}/api/v1/auth/token`,
      { client_id: cfg.clientId, secret: cfg.secret },
      { headers: { 'Content-Type': 'application/json' }, timeout: cfg.timeout }
    );
    const token     = resp.data?.access_token;
    const expiresIn = Number(resp.data?.expires_in) || 3600;
    if (!token) {
      throw Object.assign(new Error('SyPago no devolvió access_token.'), { code: 'SYPAGO_AUTH_ERROR', httpStatus: 502 });
    }
    _tokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  } catch (err) {
    if (err.code && String(err.code).startsWith('SYPAGO_')) throw err;
    _handleError(err, 'auth/token');
  }
}

async function _authHeaders(cfg) {
  const token = await _getAccessToken(cfg);
  return {
    Authorization : `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Verifica la firma de una notificación webhook de SyPago.
 * stringToSign = "{payload}.{nonce}.{operationSecret}" → SHA-256 + ECDSA, firma en Base64.
 * @returns {{ valid: boolean, reason: string }}
 */
function verifyWebhookSignature({ rawPayload, nonce, operationSecret, signatureB64, publicKeyPem }) {
  if (!publicKeyPem)                                return { valid: false, reason: 'no_public_key' };
  if (!signatureB64 || !nonce || !operationSecret)  return { valid: false, reason: 'missing_fields' };
  try {
    const stringToSign = `${rawPayload}.${nonce}.${operationSecret}`;
    const verifier = crypto.createVerify('SHA256');
    verifier.update(stringToSign);
    verifier.end();
    const valid = verifier.verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
    return { valid, reason: valid ? 'ok' : 'invalid_signature' };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

/** Genera un ID aleatorio de 12 hex en mayúsculas, compatible con el formato de SyPago */
function _randomId() {
  return (
    Math.random().toString(16).slice(2, 8).toUpperCase() +
    Math.random().toString(16).slice(2, 8).toUpperCase()
  );
}

// ── Manejo de errores ─────────────────────────────────────────────────────────

function _handleError(err, operation) {
  // Error de red (sin conexión, timeout, DNS)
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ETIMEDOUT'    ||
    err.code === 'ENOTFOUND'    ||
    err.code === 'ECONNRESET'
  ) {
    throw Object.assign(
      new Error('No se pudo conectar con SyPago. Verifica la conexión y el SYPAGO_URL.'),
      { code: 'SYPAGO_CONNECTION_ERROR' }
    );
  }

  if (err.response) {
    const status  = err.response.status;
    const data    = err.response.data || {};
    // El código de rechazo viene como rejected_code / RejectedCode / rejectedCode según el mensaje.
    const syCode  = data.code || data.rejected_code || data.RejectedCode || data.rejectedCode || String(status);
    const syMsg   = data.message || data.description || `Error HTTP ${status} de SyPago`;

    if (status === 401 || status === 403) {
      throw Object.assign(
        new Error('Token SyPago inválido o expirado. Regenera SYPAGO_BEARER_TOKEN.'),
        { code: 'SYPAGO_AUTH_ERROR', httpStatus: 502 }
      );
    }

    throw Object.assign(
      new Error(syMsg),
      { code: `SYPAGO_${syCode}`, httpStatus: status >= 500 ? 502 : 422, sypagoCode: syCode }
    );
  }

  throw Object.assign(
    new Error(`[${operation}] ${err.message}`),
    { code: 'SYPAGO_ERROR' }
  );
}

// ── API Pública ───────────────────────────────────────────────────────────────

/**
 * Paso 1 — Solicitar OTP al banco del cliente.
 *
 * El banco envía la OTP al cliente por SMS/Push/Email.
 * Este endpoint NO cobra nada; solo dispara el envío de la clave.
 *
 * @param {object} p
 * @param {string} p.documentType    Tipo de documento del deudor (V, E, J, G, P)
 * @param {string} p.documentNumber  Número de documento (sin separadores)
 * @param {string} p.debtorBankCode  Código del banco del deudor (ej. "0102")
 * @param {string} p.debtorPhone     Teléfono móvil del deudor (ej. "04141234567")
 * @param {number} p.amount          Monto en Bs
 */
async function requestOtp({ documentType, documentNumber, debtorBankCode, debtorPhone, amount }) {
  const cfg = _getConfig();

  if (cfg.mock) {
    console.log('[SyPago MOCK] requestOtp →', { documentType, documentNumber, debtorBankCode, debtorPhone, amount });
    return { success: true, mock: true, message: 'OTP enviada al teléfono del cliente [MODO PRUEBA]' };
  }

  const payload = {
    creditor_account: {
      bank_code: cfg.bankCode,
      type     : cfg.accountType,
      number   : cfg.accountNumber,
    },
    debitor_document_info: {
      type  : documentType,
      number: String(documentNumber),
    },
    debitor_account: {
      bank_code: debtorBankCode,
      type     : 'CELE',
      number   : debtorPhone,
    },
    amount: {
      amt     : amount,
      currency: 'VES',
    },
  };

  try {
    console.log(`\n[SyPago] ➡ SOLICITANDO OTP a ${cfg.baseUrl}/api/v1/request/otp`);
    console.log(`[SyPago] Payload:`, JSON.stringify(payload));
    
    const resp = await axios.post(
      `${cfg.baseUrl}/api/v1/request/otp`,
      payload,
      { headers: await _authHeaders(cfg), timeout: cfg.timeout }
    );
    
    console.log(`[SyPago] ⬅ RESPUESTA OTP (Status: ${resp.status}):`, JSON.stringify(resp.data));
    return resp.data;
  } catch (err) {
    _handleError(err, 'requestOtp');
  }
}

/**
 * Paso 2 — Confirmar OTP y ejecutar el débito.
 *
 * @param {object} p
 * @param {string} p.documentType
 * @param {string} p.documentNumber
 * @param {string} p.debtorBankCode
 * @param {string} p.debtorPhone
 * @param {string} p.debtorName      Nombre completo del deudor
 * @param {number} p.amount          Monto en Bs
 * @param {string} p.otp             Clave OTP recibida por el cliente
 * @param {string} [p.concept]       Concepto de la transacción
 *
 * @returns {{ transaction_id: string, operation_secret: string }}
 */
async function confirmOtp({ documentType, documentNumber, debtorBankCode, debtorPhone, debtorName, amount, otp, concept }) {
  const cfg = _getConfig();

  if (cfg.mock) {
    const txId = _randomId();
    console.log('[SyPago MOCK] confirmOtp →', { otp, amount, txId });
    return {
      transaction_id   : txId,
      operation_secret : `mock-secret-${Date.now()}`,
      mock             : true,
    };
  }

  const internalId = _randomId();
  const groupId    = _randomId();

  const webhookUrl = cfg.webhookUrl || 'https://webhook.site/placeholder';

  const payload = {
    internal_id: internalId,
    group_id   : groupId,
    account    : {
      bank_code: cfg.bankCode,
      type     : cfg.accountType,
      number   : cfg.accountNumber,
    },
    amount: {
      amt     : amount,
      currency: 'VES',
    },
    concept          : concept || 'Prima de seguro RCV - La Mundial',
    notification_urls: {
      web_hook_endpoint: webhookUrl,
    },
    receiving_user: {
      name         : debtorName,
      otp,
      document_info: {
        type  : documentType,
        number: String(documentNumber),
      },
      account: {
        bank_code: debtorBankCode,
        type     : 'CELE',
        number   : debtorPhone,
      },
    },
  };

  try {
    console.log(`\n[SyPago] ➡ CONFIRMANDO OTP (TxId interno: ${internalId})`);
    console.log(`[SyPago] OTP ingresado por usuario: "${otp}" (Longitud: ${otp.length})`);
    console.log(`[SyPago] Payload:`, JSON.stringify(payload));

    const resp = await axios.post(
      `${cfg.baseUrl}/api/v1/transaction/otp`,
      payload,
      { headers: await _authHeaders(cfg), timeout: cfg.timeout }
    );
    
    console.log(`[SyPago] ⬅ RESPUESTA CONFIRMACIÓN (Status: ${resp.status}):`, JSON.stringify(resp.data));
    return resp.data; // { transaction_id, operation_secret }
  } catch (err) {
    _handleError(err, 'confirmOtp');
  }
}

/**
 * Consultar estado de una transacción (polling).
 *
 * @param {string} transactionId
 * @returns {{ transaction_id, status, ... }}
 */
async function getTransactionStatus(transactionId) {
  const cfg = _getConfig();

  if (cfg.mock) {
    return {
      transaction_id: transactionId,
      status        : 'ACCP',
      statusInfo    : normalizeStatus('ACCP'),
      mock          : true,
    };
  }

  try {
    const resp = await axios.get(
      `${cfg.baseUrl}/api/v1/transaction/${transactionId}`,
      { headers: await _authHeaders(cfg), timeout: cfg.timeout }
    );
    const data = resp.data || {};
    return { ...data, statusInfo: normalizeStatus(data.status) };
  } catch (err) {
    _handleError(err, 'getTransactionStatus');
  }
}

module.exports = {
  requestOtp,
  confirmOtp,
  getTransactionStatus,
  normalizeStatus,
  verifyWebhookSignature,
};
