/**
 * Notificación server-to-server al endpoint del cliente (payload.notifyUrl).
 */
const axios = require('axios');

const NOTIFY_URL_KEYS = ['notifyUrl', 'callbackUrl', 'statusUrl', 'webhookUrl'];

function pickNotifyUrl(payload) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of NOTIFY_URL_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

function isAllowedNotifyUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return false;
  }

  const allowlist = (process.env.CHECKOUT_NOTIFY_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return true;

  const host = parsed.hostname.toLowerCase();
  return allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.tokenPayload metadata.payload del JWT
 * @param {Record<string, unknown>} params.body cuerpo enviado por el frontend
 */
async function deliverCheckoutNotify({ tokenPayload, body }) {
  const mergedPayload = {
    ...(tokenPayload && typeof tokenPayload === 'object' ? tokenPayload : {}),
    ...(body.payload && typeof body.payload === 'object' ? body.payload : {}),
  };

  const notifyUrl = pickNotifyUrl(mergedPayload);
  if (!notifyUrl) {
    const err = new Error('payload.notifyUrl no está definido en la metadata SSO.');
    err.code = 'NOTIFY_URL_MISSING';
    err.status = 400;
    throw err;
  }

  if (!isAllowedNotifyUrl(notifyUrl)) {
    const err = new Error('La URL de notificación no está permitida.');
    err.code = 'NOTIFY_URL_NOT_ALLOWED';
    err.status = 403;
    throw err;
  }

  const idOperacion =
    mergedPayload.idOperacion ??
    mergedPayload.id_operacion ??
    mergedPayload.referenceId ??
    null;

  const outbound = {
    status: body.status === 'ok' ? 'ok' : 'error',
    paymentVerified: Boolean(body.paymentVerified),
    idOperacion,
    code: body.code ?? null,
    message: body.message ?? null,
    payment: body.payment ?? null,
    checkout: body.checkout ?? null,
    payload: mergedPayload,
  };

  const clientRes = await axios.post(notifyUrl, outbound, {
    headers: { 'Content-Type': 'application/json' },
    timeout: parseInt(process.env.CHECKOUT_NOTIFY_TIMEOUT_MS || '15000', 10),
    validateStatus: () => true,
  });

  return {
    notifyUrl,
    clientStatus: clientRes.status,
    clientOk: clientRes.status >= 200 && clientRes.status < 300,
    clientBody: clientRes.data,
  };
}

module.exports = {
  deliverCheckoutNotify,
  pickNotifyUrl,
  isAllowedNotifyUrl,
};
