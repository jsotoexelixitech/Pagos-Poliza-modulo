const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Exelixi · Módulo Pagos',
      version: '1.0.0',
      description: `
## Módulo Pagos — Verificación de pagos y débito OTP

### Integración SSO segura (apps externas)

**Sí es posible** integrar Pagos sin pasar por OCR/Formulario/Emisión:

1. **Nexus API** — \`POST /api/auth/sso-delegate\` con \`target: "pagos"\`, \`x-api-key\` y metadata:
   - \`checkout.totalVes\` (monto obligatorio)
   - \`payload.notifyUrl\` (webhook HTTPS post-pago)
   - \`rules.methods\`: \`mobile\` | \`otp\` | \`domiciliacion\` | \`transfer\` | \`card\`
2. Redirigir al usuario a \`redirect_url\` (incluye \`nexus_token\`).
3. Tras pago, Pagos llama a \`POST /api/checkout/notify\` → reenvía a \`notifyUrl\`.

**Alternativa:** \`POST /api/flow/checkout-link\` en Nexus (server-to-server).

Guía completa: **Nexus** \`docs/INTEGRACION-SSO-Y-PAGOS.md\` · Swagger Nexus: \`/nexus-api/api-docs\`

---

### Métodos de pago en UI

#### 1. Pago Móvil (Meritop / Banco Activo)
\`POST /api/payments/verify-mobile\`

#### 2. Débito OTP (SyPago)
1. \`POST /api/payments/otp/request\`
2. \`POST /api/payments/otp/confirm\`
3. \`GET  /api/payments/otp/status/:transactionId\`

#### 3. Domiciliación (SyPago · débito automático de recibos)
Proxy a Nest: \`/api/domiciliacion/*\`
- \`GET  /api/domiciliacion/sypago/banks\`
- \`GET  /api/domiciliacion/polizas?numeroPoliza=\`
- \`POST /api/domiciliacion/domiciliaciones\`

En checkout SSO (Hogar/Condominio): si no hay \`numeroPoliza\` se capturan los datos
bancarios, se notifica \`DOMICILIACION_AUTORIZADA\` y se redirige a \`payload.successUrl\`.
La afiliación SyPago ocurre al emitir (póliza + recibos en Sis2000).

Tras un pago/domiciliación exitoso el webhook envía \`status: "success"\`, \`success: true\`
y \`paymentVerified: true\`. Si \`rules.autoRedirect\` no es \`false\`, el navegador vuelve
a \`payload.successUrl\`.

### Autenticación
Todas las rutas \`/api/payments/*\` y \`/api/checkout/*\` requieren **\`Authorization: Bearer <nexus_token>\`**
(obtenido vía SSO delegate o sesión del flujo RCV).

### Estado de integraciones
| Servicio | Estado |
|----------|--------|
| Meritop (Pago Móvil) | 🟡 Pendiente credenciales productivas |
| SyPago (Débito OTP)  | 🟡 Pendiente credenciales productivas |
      `.trim(),
      contact: {
        name: 'Exelixi / La Mundial de Seguros',
        email: 'soporte@lamundialdeseguros.com',
      },
    },
    servers: [
      { url: 'https://cierrelmds.exelixitech.com/pagos-api', description: 'Producción cierrelmds' },
      { url: 'http://localhost:3001', description: 'Desarrollo local' },
    ],
    tags: [
      { name: 'Integración SSO', description: 'Webhook post-pago vía metadata.notifyUrl' },
      { name: 'Pago Móvil', description: 'Verificación de pago móvil interbancario via Meritop' },
      { name: 'Débito OTP', description: 'Débito bancario con OTP via SyPago' },
      { name: 'Sistema',    description: 'Estado del servicio' },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'nexus_token del SSO delegate o sesión flujo RCV (Authorization: Bearer)',
        },
      },
      schemas: {
        VerifyMobileRequest: {
          type: 'object',
          required: ['sourcePhoneNumber','bankCode','amount','paidOn'],
          properties: {
            sourcePhoneNumber: {
              type: 'string',
              example: '04141234567',
              description: 'Teléfono origen del pago (formato venezolano 04XXXXXXXXX)',
            },
            bankCode: {
              type: 'string',
              example: '0102',
              description: 'Código del banco emisor del pago móvil (BIC / código interbancario)',
            },
            amount: {
              type: 'number',
              example: 62.80,
              description: 'Monto en bolívares (Bs) del pago realizado',
            },
            paidOn: {
              type: 'string',
              format: 'date-time',
              example: '2026-05-07T14:30:00Z',
              description: 'Fecha y hora del pago en formato ISO 8601',
            },
          },
        },
        OtpRequestBody: {
          type: 'object',
          required: ['documentType','documentNumber','debtorBankCode','debtorPhone','amount'],
          properties: {
            documentType:   { type: 'string', enum: ['V','E','J'], example: 'V' },
            documentNumber: { type: 'string', example: '12345678' },
            debtorBankCode: { type: 'string', example: '0102', description: 'Código del banco donde tiene la cuenta' },
            debtorPhone:    { type: 'string', example: '04141234567' },
            amount:         { type: 'number', example: 62.80, description: 'Monto a debitar en Bs' },
          },
        },
        OtpConfirmBody: {
          type: 'object',
          required: ['documentType','documentNumber','debtorBankCode','debtorPhone','debtorName','amount','otp'],
          properties: {
            documentType:   { type: 'string', enum: ['V','E','J'], example: 'V' },
            documentNumber: { type: 'string', example: '12345678' },
            debtorBankCode: { type: 'string', example: '0102' },
            debtorPhone:    { type: 'string', example: '04141234567' },
            debtorName:     { type: 'string', example: 'JUAN PEREZ' },
            amount:         { type: 'number', example: 62.80 },
            otp:            { type: 'string', example: '123456', description: 'Código OTP recibido por SMS' },
            concept:        { type: 'string', example: 'Pago RCV Póliza LM-2026-123456' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success:   { type: 'boolean', example: false },
            code:      { type: 'string', example: 'MERITOP_PAYMENT_NOT_FOUND' },
            message:   { type: 'string' },
            baCode:    { type: 'string', description: 'Código de error del Banco Activo' },
            baMessage: { type: 'string', description: 'Mensaje original del Banco Activo' },
          },
        },
      },
    },
    paths: {
      '/api/access/token': {
        post: {
          tags: ['Autenticación'],
          summary: 'Canjear API Key por Access Token',
          description: 'Obtiene un JWT temporal de 1 hora. **Nota:** Este endpoint es atendido por el servidor central (Nexus API).',
          servers: [{ url: 'http://192.168.8.120:3092' }],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tenantToken: { type: 'string', example: 'sk_test_123...' } }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Token generado exitosamente',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                      expires_in: { type: 'integer', example: 3600 },
                      token_type: { type: 'string', example: 'Bearer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
