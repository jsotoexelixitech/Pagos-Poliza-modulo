/**
 * Rutas del modulo Pagos.
 *
 * Soporta dos vias de cobro:
 *   - Pago Movil → verificacion via Meritop / Banco Activo.
 *   - Debito OTP → SyPago (request → confirm → status).
 */
const express = require('express');
const crypto  = require('crypto');
const rateLimit = require('express-rate-limit');
const { verifyMobilePayment } = require('../services/meritopClient');
const sypagoClient = require('../services/sypagoClient');

const router = express.Router();

// ── Idempotency store para /otp/confirm ───────────────────────────────────
// Previene debitos duplicados si el usuario pulsa "Confirmar" varias veces.
const OTP_IDEM_TTL_MS = 120_000;
const _otpIdemStore   = new Map();

function _otpIdemKey({ documentType, documentNumber, debtorBankCode, debtorPhone, amount, otp }) {
  return crypto
    .createHash('sha256')
    .update(`${documentType}|${documentNumber}|${debtorBankCode}|${debtorPhone}|${amount}|${otp}`)
    .digest('hex');
}
function _otpIdemGet(key) {
  const e = _otpIdemStore.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { _otpIdemStore.delete(key); return null; }
  return e.response;
}
function _otpIdemSet(key, response) {
  _otpIdemStore.set(key, { expiresAt: Date.now() + OTP_IDEM_TTL_MS, response });
  if (_otpIdemStore.size > 200) {
    const now = Date.now();
    for (const [k, v] of _otpIdemStore) { if (now > v.expiresAt) _otpIdemStore.delete(k); }
  }
}

// ── Rate limiter especifico para confirmacion OTP ─────────────────────────
// Max 2 confirmaciones por IP en 30 s — capa extra anti-doble-debito.
const otpConfirmLimiter = rateLimit({
  windowMs: 30_000,
  max: parseInt(process.env.RATE_LIMIT_OTP_CONFIRM, 10) || 2,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (_req, res) => res.status(429).json({
    success: false,
    code: 'OTP_CONFIRM_RATE_LIMIT',
    message: 'Ya se proceso una confirmacion OTP recientemente. Espera unos segundos.',
    retryAfter: 30,
  }),
});

/**
 * @openapi
 * /api/payments/verify-mobile:
 *   post:
 *     tags: [Pago Móvil]
 *     summary: Verifica un pago móvil interbancario
 *     description: |
 *       Consulta el gateway Meritop / Banco Activo para confirmar que el cliente realizó
 *       el pago móvil. La verificación tarda entre 1 y 10 segundos dependiendo del banco.
 *
 *       **Importante:** El monto debe ser en **bolívares (Bs)** y coincidir exactamente con
 *       el que el cliente transfirió.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VerifyMobileRequest' }
 *     responses:
 *       200:
 *         description: Pago verificado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean, example: true }
 *                 verified:      { type: boolean, example: true }
 *                 transactionId: { type: string }
 *                 message:       { type: string }
 *       400:
 *         description: Campos faltantes o formato inválido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         description: Pago no encontrado o monto incorrecto
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       503:
 *         description: Gateway Meritop no disponible
 */
router.post('/verify-mobile', async (req, res) => {
  const { sourcePhoneNumber, bankCode, amount, paidOn } = req.body || {};

  const missing = [];
  if (!sourcePhoneNumber) missing.push('sourcePhoneNumber');
  if (!bankCode)           missing.push('bankCode');
  if (amount == null)      missing.push('amount');
  if (!paidOn)             missing.push('paidOn');
  if (missing.length) return res.status(400).json({ success: false, code: 'MERITOP_MISSING_FIELDS', missing, message: `Faltan: ${missing.join(', ')}` });

  const phoneRe = /^(0|\+?58)4\d{9}$|^04\d{9}$/;
  if (!phoneRe.test(String(sourcePhoneNumber).replace(/\s/g, '')))
    return res.status(400).json({ success: false, code: 'MERITOP_INVALID_PHONE', message: 'Telefono invalido. Formato: 04XXXXXXXXX' });

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0)
    return res.status(400).json({ success: false, code: 'MERITOP_INVALID_AMOUNT', message: 'Monto debe ser positivo.' });

  if (isNaN(Date.parse(paidOn)))
    return res.status(400).json({ success: false, code: 'MERITOP_INVALID_DATE', message: 'Fecha invalida (ISO 8601).' });

  try {
    const result = await verifyMobilePayment({
      sourcePhoneNumber: String(sourcePhoneNumber).replace(/\s/g, ''),
      bankCode: String(bankCode).trim(),
      amount: parsedAmount,
      paidOn,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const code = err.code || 'MERITOP_ERROR';
    if (['MERITOP_CONNECTION_ERROR', 'MERITOP_MISSING_APIKEY', 'MERITOP_DISABLED'].includes(code))
      return res.status(503).json({ success: false, code, message: err.message });
    if (['MERITOP_INVALID_APIKEY', 'MERITOP_IP_NOT_ALLOWED', 'MERITOP_AUTH_ERROR'].includes(code))
      return res.status(502).json({ success: false, code, message: err.message });
    return res.status(422).json({ success: false, code, baCode: err.baCode || null, baMessage: err.baMessage || null, message: err.message || 'Error verificando.' });
  }
});

/**
 * @openapi
 * /api/payments/otp/request:
 *   post:
 *     tags: [Débito OTP]
 *     summary: Solicita envío de OTP al cliente
 *     description: |
 *       Inicia el flujo de débito SyPago. Envía un SMS con el código OTP al teléfono
 *       del cliente. El OTP tiene vigencia de 5 minutos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OtpRequestBody' }
 *     responses:
 *       200:
 *         description: OTP enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'OTP enviada.' }
 *       400:
 *         description: Campos obligatorios faltantes
 *       503:
 *         description: SyPago no disponible
 *
 * /api/payments/otp/confirm:
 *   post:
 *     tags: [Débito OTP]
 *     summary: Confirma el débito con el OTP recibido
 *     description: |
 *       Finaliza el débito bancario usando el código OTP que el cliente recibió por SMS.
 *       Retorna el ID de transacción si el débito fue exitoso.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OtpConfirmBody' }
 *     responses:
 *       200:
 *         description: Débito confirmado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean, example: true }
 *                 transactionId: { type: string }
 *                 status:        { type: string, example: 'APPROVED' }
 *       400:
 *         description: Campos faltantes
 *       422:
 *         description: OTP inválido, expirado o fondos insuficientes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/payments/otp/status/{transactionId}:
 *   get:
 *     tags: [Débito OTP]
 *     summary: Consulta el estado de una transacción SyPago
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema: { type: string }
 *         description: ID de transacción retornado por /otp/confirm
 *     responses:
 *       200:
 *         description: Estado de la transacción
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 status:  { type: string, example: 'APPROVED' }
 *                 amount:  { type: number }
 *       422:
 *         description: Transacción no encontrada
 */
router.post('/otp/request', async (req, res) => {
  const { documentType, documentNumber, debtorBankCode, debtorPhone, amount } = req.body || {};
  const missing = [];
  if (!documentType)   missing.push('documentType');
  if (!documentNumber) missing.push('documentNumber');
  if (!debtorBankCode) missing.push('debtorBankCode');
  if (!debtorPhone)    missing.push('debtorPhone');
  if (amount == null)  missing.push('amount');
  if (missing.length) return res.status(400).json({ success: false, code: 'SYPAGO_MISSING_FIELDS', missing, message: `Faltan: ${missing.join(', ')}` });

  try {
    const result = await sypagoClient.requestOtp({
      documentType, documentNumber: String(documentNumber).trim(),
      debtorBankCode, debtorPhone: String(debtorPhone).replace(/\s/g, ''),
      amount: parseFloat(amount),
    });
    return res.status(200).json({ success: true, message: result?.message || 'OTP enviada.' });
  } catch (err) {
    return _sendSypagoError(res, err);
  }
});

router.post('/otp/confirm', otpConfirmLimiter, async (req, res) => {
  const { documentType, documentNumber, debtorBankCode, debtorPhone, debtorName, amount, otp, concept } = req.body || {};
  const missing = [];
  if (!documentType)   missing.push('documentType');
  if (!documentNumber) missing.push('documentNumber');
  if (!debtorBankCode) missing.push('debtorBankCode');
  if (!debtorPhone)    missing.push('debtorPhone');
  if (!debtorName)     missing.push('debtorName');
  if (amount == null)  missing.push('amount');
  if (!otp)            missing.push('otp');
  if (missing.length) return res.status(400).json({ success: false, code: 'SYPAGO_MISSING_FIELDS', missing, message: `Faltan: ${missing.join(', ')}` });

  const parsedOtp    = String(otp).trim();
  const parsedPhone  = String(debtorPhone).replace(/\s/g, '');
  const parsedDoc    = String(documentNumber).trim();
  const parsedAmount = parseFloat(amount);
  const parsedName   = String(debtorName).trim();

  // Idempotency check — ignora duplicados dentro de 120 s
  const idemKey    = _otpIdemKey({ documentType, documentNumber: parsedDoc, debtorBankCode, debtorPhone: parsedPhone, amount: parsedAmount, otp: parsedOtp });
  const cachedResp = _otpIdemGet(idemKey);
  if (cachedResp) {
    console.warn(`[SyPago] Solicitud duplicada ignorada. key=${idemKey.slice(0, 12)}...`);
    return res.status(200).json({ ...cachedResp, duplicate: true });
  }

  try {
    const result = await sypagoClient.confirmOtp({
      documentType,
      documentNumber: parsedDoc,
      debtorBankCode,
      debtorPhone   : parsedPhone,
      debtorName    : parsedName,
      amount        : parsedAmount,
      otp           : parsedOtp,
      concept,
    });
    const responseBody = { success: true, ...result };
    _otpIdemSet(idemKey, responseBody);
    return res.status(200).json(responseBody);
  } catch (err) {
    return _sendSypagoError(res, err);
  }
});

router.get('/otp/status/:transactionId', async (req, res) => {
  try {
    const result = await sypagoClient.getTransactionStatus(req.params.transactionId);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return _sendSypagoError(res, err);
  }
});

function _sendSypagoError(res, err) {
  const code = err.code || 'SYPAGO_ERROR';
  if (['SYPAGO_CONNECTION_ERROR', 'SYPAGO_MISSING_TOKEN'].includes(code))
    return res.status(503).json({ success: false, code, message: err.message });
  if (code === 'SYPAGO_AUTH_ERROR')
    return res.status(502).json({ success: false, code, message: err.message });
  return res.status(err.httpStatus || 422).json({ success: false, code, message: err.message, sypagoCode: err.sypagoCode || null });
}

module.exports = router;
