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

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const m = host.match(/^172\.(\d+)\./);
  if (m) {
    const second = parseInt(m[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
}

function parseAllowlist() {
  return (process.env.CHECKOUT_NOTIFY_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatchesAllowlist(host, allowlist) {
  return allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * @returns {{ allowed: true } | { allowed: false, reason: string, host: string, protocol: string }}
 */
function evaluateNotifyUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'INVALID_URL', host: '', protocol: '' };
  }

  const host = parsed.hostname.toLowerCase();
  const protocol = parsed.protocol;

  const allowHttp = process.env.CHECKOUT_NOTIFY_ALLOW_HTTP === 'true';
  const allowPrivateHttp =
    process.env.CHECKOUT_NOTIFY_ALLOW_PRIVATE_HTTP === 'true' &&
    isPrivateHost(host);

  if (
    process.env.NODE_ENV === 'production' &&
    protocol !== 'https:' &&
    !allowHttp &&
    !allowPrivateHttp
  ) {
    return {
      allowed: false,
      reason: 'HTTPS_REQUIRED',
      host,
      protocol,
    };
  }

  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    return { allowed: true, host, protocol };
  }

  if (!hostMatchesAllowlist(host, allowlist)) {
    return {
      allowed: false,
      reason: 'HOST_NOT_IN_ALLOWLIST',
      host,
      protocol,
    };
  }

  return { allowed: true, host, protocol };
}

function isAllowedNotifyUrl(rawUrl) {
  return evaluateNotifyUrl(rawUrl).allowed;
}

function buildNotifyPayload(tokenMetadata, body) {
  const rules =
    tokenMetadata?.rules && typeof tokenMetadata.rules === 'object'
      ? tokenMetadata.rules
      : {};
  const onSuccess =
    rules.onSuccess && typeof rules.onSuccess === 'object'
      ? rules.onSuccess
      : {};

  const tokenPayload =
    tokenMetadata?.payload && typeof tokenMetadata.payload === 'object'
      ? tokenMetadata.payload
      : {};

  const fromRules = {};
  if (typeof onSuccess.webhookUrl === 'string') {
    fromRules.webhookUrl = onSuccess.webhookUrl;
  }
  if (typeof onSuccess.redirectUrl === 'string') {
    fromRules.callbackUrl = onSuccess.redirectUrl;
  }

  return {
    ...tokenPayload,
    ...fromRules,
    ...(body.payload && typeof body.payload === 'object' ? body.payload : {}),
  };
}

function notifyUrlDenyMessage(evaluation) {
  if (evaluation.reason === 'HTTPS_REQUIRED') {
    return (
      'La URL de notificación debe usar HTTPS en producción. ' +
      'Use https:// en notifyUrl o configure CHECKOUT_NOTIFY_ALLOW_PRIVATE_HTTP=true ' +
      '(red interna) / CHECKOUT_NOTIFY_ALLOW_HTTP=true (solo QA).'
    );
  }
  if (evaluation.reason === 'HOST_NOT_IN_ALLOWLIST') {
    const allowlist = parseAllowlist();
    return (
      `El dominio "${evaluation.host}" no está en CHECKOUT_NOTIFY_ALLOWLIST ` +
      `(${allowlist.join(', ')}).`
    );
  }
  return 'La URL de notificación no está permitida.';
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} [params.tokenMetadata] metadata completa del JWT
 * @param {Record<string, unknown>} [params.tokenPayload] metadata.payload del JWT (legacy)
 * @param {Record<string, unknown>} params.body cuerpo enviado por el frontend
 */
async function deliverCheckoutNotify({ tokenMetadata, tokenPayload, body }) {
  const metadata =
    tokenMetadata && typeof tokenMetadata === 'object'
      ? tokenMetadata
      : tokenPayload && typeof tokenPayload === 'object'
        ? { payload: tokenPayload }
        : {};

  const mergedPayload = buildNotifyPayload(metadata, body);

  const notifyUrl = pickNotifyUrl(mergedPayload);
  if (!notifyUrl) {
    const err = new Error(
      'payload.notifyUrl no está definido en la metadata SSO (payload o rules.onSuccess.webhookUrl).',
    );
    err.code = 'NOTIFY_URL_MISSING';
    err.status = 400;
    throw err;
  }

  const evaluation = evaluateNotifyUrl(notifyUrl);
  if (!evaluation.allowed) {
    const err = new Error(notifyUrlDenyMessage(evaluation));
    err.code = 'NOTIFY_URL_NOT_ALLOWED';
    err.status = 403;
    err.details = {
      reason: evaluation.reason,
      host: evaluation.host,
      protocol: evaluation.protocol,
      notifyUrl,
    };
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
  evaluateNotifyUrl,
  buildNotifyPayload,
};
