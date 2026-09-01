const express = require('express');
const { deliverCheckoutNotify } = require('../services/checkoutNotify');

const router = express.Router();

/**
 * POST /api/checkout/notify
 * Pagos-api reenvía el estado del pago al notifyUrl del cliente (metadata.payload).
 */
/**
 * @openapi
 * /api/checkout/notify:
 *   post:
 *     tags: [Integración SSO]
 *     summary: Notificar pago al webhook del cliente (notifyUrl)
 *     description: |
 *       Llamado por el frontend Pagos tras verificar el pago. **pagos-api** lee
 *       `metadata.payload.notifyUrl` del `nexus_token` y hace POST server-to-server
 *       al endpoint del integrador (QASys2000, etc.).
 *
 *       Configurar `notifyUrl` en el SSO delegate (`target: pagos`) o en
 *       `metadata.payload` / `rules.onSuccess.webhookUrl`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: paid
 *               paymentMethod:
 *                 type: string
 *                 enum: [mobile, otp, domiciliacion, transfer, card]
 *               referenceId:
 *                 type: string
 *               amountVes:
 *                 type: number
 *               checkout:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cliente notificado correctamente (2xx desde notifyUrl)
 *       502:
 *         description: notifyUrl respondió error o no configurado
 */
router.post('/notify', async (req, res) => {
  try {
    const result = await deliverCheckoutNotify({
      tokenMetadata: req.nexusMetadata,
      body: req.body || {},
    });

    if (!result.clientOk) {
      return res.status(502).json({
        success: false,
        code: 'NOTIFY_CLIENT_ERROR',
        message: `El cliente respondió HTTP ${result.clientStatus}.`,
        clientStatus: result.clientStatus,
      });
    }

    return res.json({
      success: true,
      notified: true,
      clientStatus: result.clientStatus,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      code: err.code || 'NOTIFY_ERROR',
      message: err.message || 'Error al notificar al cliente.',
      ...(err.details ? { details: err.details } : {}),
    });
  }
});

module.exports = router;
