/**
 * Proxy al backend Nest de Domiciliación.
 *
 * El frontend de pagos llama a /api/domiciliacion/* y este router reenvía
 * a DOMICILIACION_API_URL (por defecto http://localhost:3000/domiciliacion-services).
 *
 * Rutas Nest esperadas:
 *   GET  /sypago/banks
 *   GET  /polizas?numeroPoliza=
 *   GET  /polizas/:id/recibos-pendientes
 *   POST /domiciliaciones
 */
const express = require('express');
const axios = require('axios');

const router = express.Router();

const DOMICILIACION_URL = (
  process.env.DOMICILIACION_API_URL || 'https://cierrelmds.exelixitech.com/domiciliacion-services'
).replace(/\/$/, '');

/**
 * @openapi
 * /api/domiciliacion/{path}:
 *   get:
 *     tags: [Domiciliación]
 *     summary: Proxy al servicio Nest de domiciliación (consulta)
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [Domiciliación]
 *     summary: Proxy al servicio Nest de domiciliación (registro)
 *     security:
 *       - bearerAuth: []
 */
router.use(async (req, res) => {
  try {
    const upstream = await axios({
      method: req.method,
      url: `${DOMICILIACION_URL}${req.url}`,
      data: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      timeout: 60_000,
      validateStatus: () => true,
      responseType: 'json',
    });

    const contentType = upstream.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(upstream.data);
  } catch (err) {
    console.error('[pagos → domiciliacion proxy]', err.message);
    return res.status(502).json({
      success: false,
      code: 'DOMICILIACION_PROXY_ERROR',
      message: err.message || 'No se pudo conectar con el servicio de domiciliación.',
    });
  }
});

module.exports = router;
