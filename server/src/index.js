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
const cors = require('cors');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const pagosRoutes = require('./routes/pagos');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 4003;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

app.use(cors({
  origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

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
    meritop: { enabled: process.env.MERITOP_ENABLED !== 'false', mock: process.env.MERITOP_MOCK === 'true' },
    sypago:  { mock: process.env.SYPAGO_MOCK === 'true', url: process.env.SYPAGO_URL || null },
  });
});

app.use('/api/payments', pagosRoutes);

app.use((err, _req, res, _next) => {
  console.error('[modulo-pagos] error:', err);
  res.status(err.status || 500).json({ success: false, code: err.code || 'INTERNAL', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[modulo-pagos] escuchando en http://localhost:${PORT}`);
  console.log(`[modulo-pagos] Swagger UI → http://localhost:${PORT}/docs`);
});
