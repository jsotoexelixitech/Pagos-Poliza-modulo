/**
 * Exelixi · Modulo Pagos
 *
 * Backend que cubre:
 *   - Verificacion de pago movil (Meritop / Banco Activo).
 *   - Debito OTP (SyPago).
 *
 * Endpoints:
 *   POST /api/payments/verify-mobile
 *   POST /api/payments/otp/request
 *   POST /api/payments/otp/confirm
 *   GET  /api/payments/otp/status/:transactionId
 *   GET  /api/health
 */
require('dotenv').config();
const cors    = require('cors');
const express = require('express');
const axios   = require('axios');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const pagosRoutes = require('./routes/pagos');
const checkoutRoutes = require('./routes/checkout');
const { getVerifyMobileTargetUrl } = require('./services/meritopClient');
const nexusAuth   = require('./middleware/nexusAuth');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 4003;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

app.use(cors({
  origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '1mb',
  // Guardamos el body crudo para validar la firma del webhook de SyPago.
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// ── Swagger UI ────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Pagos API · Exelixi',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    module: 'pagos',
    lamundialPayments: {
      enabled: process.env.LAMUNDIAL_PAYMENTS_ENABLED !== 'false',
      mock: process.env.LAMUNDIAL_PAYMENTS_MOCK === 'true',
      url: (process.env.LAMUNDIAL_PAYMENTS_URL || 'https://apisys2000.lamundialdeseguros.com').replace(/\/$/, ''),
      verifyMobileTarget: getVerifyMobileTargetUrl(),
    },
    sypago:  { mock: process.env.SYPAGO_MOCK === 'true', url: process.env.SYPAGO_URL || null },
    nexusAuth: process.env.NEXUS_AUTH_ENABLED === 'true',
  });
});

// ── Proxy a modulo-emision para cotizar y emitir pólizas ──────────────────
// En producción el frontend de pagos (5184) no pasa por Vite, así que el
// servidor de pagos actúa como proxy transparente hacia el backend de emisión.
const EMISION_URL = (process.env.EMISION_API_URL ?? 'http://localhost:4004').replace(/\/$/, '');

async function _proxyToEmision(req, res) {
  try {
    const authHeader = req.nexusToken
      ? `Bearer ${req.nexusToken}`
      : req.headers.authorization;
    const upstream = await axios({
      method: req.method,
      url: `${EMISION_URL}${req.originalUrl}`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(req.headers['x-nexus-token']
          ? { 'x-nexus-token': req.headers['x-nexus-token'] }
          : {}),
      },
      timeout: 90_000,
      validateStatus: () => true,
    });
    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    console.error('[pagos → emision proxy]', err.message);
    res.status(502).json({ success: false, code: 'EMISION_PROXY_ERROR', message: err.message });
  }
}

app.post('/api/policies/emit',  nexusAuth, _proxyToEmision);
app.post('/api/policies/quote', nexusAuth, _proxyToEmision);
app.post('/api/exelixi/quote',  nexusAuth, _proxyToEmision);
app.post('/api/exelixi/emit',   nexusAuth, _proxyToEmision);
// Producto Funerario (personas, ramo 9): cotización y emisión viven en emisión.
app.post('/api/personas/:path(*)', nexusAuth, _proxyToEmision);
app.get('/api/personas/:path(*)',  nexusAuth, _proxyToEmision);
// Catálogos INMA (para mostrar datos del vehículo en el checkout)
app.get('/api/catalogo/:path(*)', _proxyToEmision);
app.get('/api/valrep/:path(*)',   _proxyToEmision);
app.post('/api/valrep/validate-vehicle', nexusAuth, _proxyToEmision);

// Webhook de SyPago — PÚBLICO (lo invoca SyPago, valida con firma propia).
// Se monta antes del router protegido para que no exija nexus_token.
app.post('/api/payments/otp/webhook', pagosRoutes.handleSypagoWebhook);

// Multi-tenant: pagos y notificación checkout requieren nexus_token
app.use('/api/checkout', nexusAuth, checkoutRoutes);
app.use('/api/payments', nexusAuth, pagosRoutes);

app.use((err, _req, res, _next) => {
  console.error('[modulo-pagos] error:', err);
  res.status(err.status || 500).json({ success: false, code: err.code || 'INTERNAL', message: err.message });
});

app.listen(PORT, () => {
  const payUrl = getVerifyMobileTargetUrl();
  console.log(`[modulo-pagos] escuchando en http://localhost:${PORT}`);
  console.log(`[modulo-pagos] Swagger UI → http://localhost:${PORT}/docs`);
  console.log(`[modulo-pagos] verify-mobile → ${payUrl}`);
});
