'use strict';

/** Códigos de rechazo SyPago — catálogo base (se complementa con GET /api/v1/banks/reject_codes). */
const REJECT_CODE_DESCRIPTIONS = {
  AB01: 'Proceso cancelado por tiempo de espera. Intenta de nuevo.',
  AB07: 'El banco del pagador no está en línea. Intenta más tarde.',
  AB08: 'No hay comunicación con el banco del pagador. Intenta más tarde.',
  AC00: 'Operación en espera de respuesta del banco.',
  AC01: 'El número de cuenta o teléfono no es válido.',
  AC04: 'La cuenta del pagador está cancelada en el banco.',
  AC06: 'La cuenta del pagador está bloqueada.',
  AC09: 'Moneda no válida.',
  ACCP: 'Operación aceptada.',
  AG01: 'Transacción restringida para este tipo de cuenta.',
  AG09: 'Pago no recibido por el banco.',
  AG10: 'El banco del pagador está suspendido del sistema de pagos.',
  AM02: 'El monto no cumple con los límites del banco.',
  AM03: 'Moneda no permitida para esta operación.',
  AM04: 'Fondos insuficientes en la cuenta del pagador.',
  AM05: 'Operación duplicada.',
  BE01: 'Los datos del pagador no coinciden con los registrados en el banco.',
  BE20: 'El nombre del pagador supera la longitud permitida.',
  CANC: 'Operación cancelada por el usuario.',
  CH20: 'El monto tiene demasiados decimales.',
  CUST: 'Cancelación solicitada por el pagador.',
  DS02: 'Operación cancelada.',
  DT03: 'Fecha de procesamiento no válida.',
  DU01: 'Operación duplicada.',
  ED05: 'Error en la liquidación de la transacción.',
  EX01: 'Operación cancelada por expiración.',
  FF05: 'Código de producto inválido.',
  FF07: 'Código de subproducto inválido.',
  MBE01: 'El pagador no está afiliado al débito inmediato en su banco.',
  MD01: 'El pagador no tiene afiliación activa con el acreedor.',
  MD09: 'Afiliación inactiva en el banco del pagador.',
  MD15: 'El monto supera el límite configurado por el pagador.',
  MD21: 'El cobro no cumple los parámetros del pagador.',
  MD22: 'Afiliación suspendida por el pagador.',
  PEND: 'Operación pendiente.',
  PROC: 'Operación en proceso.',
  RC08: 'Código de banco inválido en el sistema de pagos.',
  RJCT: 'Operación rechazada por el banco.',
  TE11: 'Error de conexión con el banco. Puedes reintentar.',
  TE28: 'Formato de datos rechazado por el banco.',
  TE29: 'Rechazo técnico del banco.',
  TKCM: 'Código de aceptación de débito incorrecto.',
  TM01: 'Fuera del horario permitido para débitos.',
  US03: 'Error de conexión con el banco. Puedes reintentar.',
  VE01: 'Rechazo técnico del banco.',
  WAIT: 'En espera de validación del código OTP.',
};

let dynamicRejectCodes = {};
let rejectCodesFetchedAt = 0;
const REJECT_CODES_TTL_MS = 12 * 60 * 60 * 1000;

function rejectDescription(code) {
  if (!code) return null;
  const key = String(code).toUpperCase();
  return dynamicRejectCodes[key] || REJECT_CODE_DESCRIPTIONS[key] || null;
}

function collectStrings(value, out, depth = 0) {
  if (depth > 4 || value == null) return;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out, depth + 1));
  }
}

function extractRawMessages(data) {
  const messages = [];
  if (typeof data === 'string') {
    messages.push(data.trim());
    return messages;
  }
  if (!data || typeof data !== 'object') return messages;

  const direct = [
    data.message,
    data.description,
    data.detail,
    data.title,
    data.error,
    data.mensaje,
    data.rejected_message,
    data.RejectedMessage,
  ];
  direct.forEach((m) => collectStrings(m, messages));

  if (Array.isArray(data.errors)) {
    data.errors.forEach((e) => {
      if (typeof e === 'string') messages.push(e);
      else if (e?.message) messages.push(String(e.message));
      else if (e?.description) messages.push(String(e.description));
    });
  }

  collectStrings(data.error, messages);
  collectStrings(data.details, messages);

  return [...new Set(messages.filter(Boolean))];
}

function humanizeFormatMessage(raw) {
  const msg = String(raw);

  if (/tel[eé]fono no es v[aá]lido/i.test(msg)) {
    return 'El número de teléfono no es válido o no está registrado en el banco seleccionado. Usa el formato 04141234567.';
  }
  if (/cuenta emisora no ha sido registrada/i.test(msg)) {
    return 'La cuenta de cobro no está registrada en SyPago. Contacta a soporte técnico.';
  }
  if (/no est[aá] registrado/i.test(msg)) {
    return 'El pagador no está registrado para débito OTP en su banco.';
  }
  if (/errores de formato/i.test(msg)) {
    const match = msg.match(/Mensaje:\s*([^]+?)(?:\s*Valor:|$)/i);
    if (match?.[1]) return match[1].trim();
  }
  if (/No se recibio status code exitoso/i.test(msg)) {
    return 'El banco no pudo procesar la solicitud. Verifica teléfono, banco y documento del pagador.';
  }

  return msg.trim();
}

function pickBestMessage(messages, httpStatus) {
  const useful = messages
    .map(humanizeFormatMessage)
    .filter((m) => m && !/^Error HTTP \d+/i.test(m));

  const nonGeneric = useful.filter(
    (m) => !/No se recibio status code exitoso/i.test(m),
  );

  if (nonGeneric.length > 0) return nonGeneric[0];
  if (useful.length > 0) return useful[0];

  if (httpStatus === 409) {
    return 'Datos con formato incorrecto. Revisa teléfono (04141234567), banco y monto.';
  }
  if (httpStatus === 400) {
    return 'Datos del pagador rechazados. Verifica teléfono, banco y documento.';
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return 'Token SyPago inválido o expirado.';
  }

  return `Error del servicio de pagos (HTTP ${httpStatus}).`;
}

function extractRejectCode(data, httpStatus) {
  if (!data || typeof data !== 'object') return null;
  const code = data.rejected_code || data.RejectedCode || data.rejectedCode || data.code;
  if (!code) return null;
  const str = String(code).toUpperCase();
  if (/^\d+$/.test(str) && str === String(httpStatus)) return null;
  if (str.length <= 4 && REJECT_CODE_DESCRIPTIONS[str]) return str;
  if (dynamicRejectCodes[str]) return str;
  if (/^[A-Z]{2}\d{2}$/.test(str)) return str;
  return null;
}

/**
 * Normaliza la respuesta de error de SyPago a mensaje legible para el usuario.
 * @returns {{ message: string, sypagoCode: string, rejectCode: string|null, rawMessages: string[] }}
 */
function parseSypagoErrorResponse(httpStatus, data) {
  const status = Number(httpStatus) || 0;
  const rawMessages = extractRawMessages(data);
  const rejectCode = extractRejectCode(data, status);
  const mappedReject = rejectDescription(rejectCode);

  if (mappedReject && rejectCode && !['ACCP', 'PEND', 'PROC', 'WAIT'].includes(rejectCode)) {
    return {
      message     : mappedReject,
      sypagoCode  : rejectCode,
      rejectCode,
      rawMessages,
    };
  }

  const message = pickBestMessage(rawMessages, status);
  const sypagoCode = rejectCode || (data?.code && !/^\d+$/.test(String(data.code)) ? String(data.code) : String(status));

  return {
    message,
    sypagoCode,
    rejectCode,
    rawMessages,
  };
}

/**
 * Actualiza el catálogo dinámico desde SyPago (GET /api/v1/banks/reject_codes).
 * Falla en silencio — el mapa estático sigue disponible.
 */
async function refreshRejectCodes(baseUrl, authHeaders, timeout = 15000) {
  if (Date.now() - rejectCodesFetchedAt < REJECT_CODES_TTL_MS) return;

  const axios = require('axios');
  try {
    const resp = await axios.get(`${baseUrl}/api/v1/banks/reject_codes`, {
      headers: authHeaders,
      timeout,
    });
    const list = Array.isArray(resp.data) ? resp.data : resp.data?.data;
    if (!Array.isArray(list)) return;

    const next = {};
    list.forEach((item) => {
      const code = item?.code || item?.Code;
      const desc = item?.description || item?.Description;
      if (code && desc) next[String(code).toUpperCase()] = String(desc);
    });
    dynamicRejectCodes = next;
    rejectCodesFetchedAt = Date.now();
  } catch {
    // catálogo estático suficiente
  }
}

module.exports = {
  REJECT_CODE_DESCRIPTIONS,
  parseSypagoErrorResponse,
  refreshRejectCodes,
  rejectDescription,
};
