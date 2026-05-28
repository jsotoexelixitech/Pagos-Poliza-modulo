'use strict';

/**
 * Almacén en memoria de transacciones SyPago.
 *
 * Guarda el `operation_secret` devuelto por /transaction/otp (necesario para
 * validar la firma del webhook) y el último estado conocido de la transacción.
 *
 * Es in-memory con TTL: suficiente para el flujo de una sesión de pago. Si en
 * el futuro se requiere persistencia entre reinicios, sustituir por Redis/DB.
 */

const TTL_MS  = 30 * 60 * 1000; // 30 min
const MAX_TX  = 1000;
const _store  = new Map();

function _prune() {
  if (_store.size <= MAX_TX) return;
  const now = Date.now();
  for (const [k, v] of _store) {
    if (now > v.expiresAt) _store.delete(k);
  }
}

function put(transactionId, data) {
  if (!transactionId) return;
  _store.set(String(transactionId), {
    ...data,
    expiresAt: Date.now() + TTL_MS,
  });
  _prune();
}

function get(transactionId) {
  const entry = _store.get(String(transactionId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _store.delete(String(transactionId));
    return null;
  }
  return entry;
}

function update(transactionId, patch) {
  const entry = get(transactionId);
  if (!entry) return null;
  const merged = { ...entry, ...patch, expiresAt: Date.now() + TTL_MS };
  _store.set(String(transactionId), merged);
  return merged;
}

module.exports = { put, get, update };
