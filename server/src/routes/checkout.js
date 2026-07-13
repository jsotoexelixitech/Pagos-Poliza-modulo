const express = require('express');
const { deliverCheckoutNotify } = require('../services/checkoutNotify');

const router = express.Router();

/**
 * POST /api/checkout/notify
 * Pagos-api reenvía el estado del pago al notifyUrl del cliente (metadata.payload).
 */
router.post('/notify', async (req, res) => {
  try {
    const tokenPayload = req.nexusMetadata?.payload;
    const result = await deliverCheckoutNotify({
      tokenPayload,
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
    });
  }
});

module.exports = router;
