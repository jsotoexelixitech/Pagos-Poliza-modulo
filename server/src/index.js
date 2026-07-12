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
const nexusAuth   = require('./middleware/nexusAuth');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 3001;
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
    meritop: {
      enabled: process.env.MERITOP_ENABLED !== 'false',
      mock: process.env.MERITOP_MOCK === 'true',
      url: process.env.MERITOP_URL2 || 'http://172.30.149.18:9040',
    },
    sypago:  { mock: process.env.SYPAGO_MOCK === 'true', url: process.env.SYPAGO_URL || null },
    nexusAuth: process.env.NEXUS_AUTH_ENABLED === 'true',
  });
});

// ── Proxy a modulo-emision para cotizar y emitir pólizas ──────────────────
// En producción el frontend de pagos (5180) no pasa por Vite, así que el
// servidor de pagos actúa como proxy transparente hacia el backend de emisión.
const EMISION_URL = (process.env.EMISION_API_URL ?? 'http://localhost:4004').replace(/\/$/, '');

async function _proxyToEmision(req, res) {
  try {
    const upstream = await axios({
      method: req.method,
      url: `${EMISION_URL}${req.originalUrl}`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
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
// Producto Funerario (personas, ramo 9): cotización y emisión viven en emisión.
app.post('/api/personas/:path(*)', nexusAuth, _proxyToEmision);
app.get('/api/personas/:path(*)',  nexusAuth, _proxyToEmision);
// Catálogos INMA (para mostrar datos del vehículo en el checkout)
app.get('/api/catalogo/:path(*)', _proxyToEmision);
app.get('/api/valrep/:path(*)',   _proxyToEmision);

// Webhook de SyPago — PÚBLICO (lo invoca SyPago, valida con firma propia).
// Se monta antes del router protegido para que no exija nexus_token.
app.post('/api/payments/otp/webhook', pagosRoutes.handleSypagoWebhook);

// Multi-tenant: todos los endpoints de pago requieren nexus_token
app.use('/api/payments', nexusAuth, pagosRoutes);

app.use((err, _req, res, _next) => {
  console.error('[modulo-pagos] error:', err);
  res.status(err.status || 500).json({ success: false, code: err.code || 'INTERNAL', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[modulo-pagos] escuchando en http://localhost:${PORT}`);
  console.log(`[modulo-pagos] Swagger UI → http://localhost:${PORT}/docs`);
});
