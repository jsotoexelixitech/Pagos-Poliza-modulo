const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Exelixi · Módulo Pagos',
      version: '1.0.0',
      description: `
## Módulo Pagos — Verificación de pagos y débito OTP

Gestiona los dos métodos de pago disponibles en el flujo de suscripción RCV:

### 1. Pago Móvil (Meritop / Banco Activo)
Verifica que el cliente realizó un pago móvil interbancario. El servidor consulta
el gateway **Meritop** con los datos del pago y retorna si la transacción fue encontrada.

\`\`\`
POST /api/payments/verify-mobile
\`\`\`

### 2. Débito OTP (SyPago)
Flujo de 3 pasos para debitar directamente desde la cuenta bancaria del cliente:
1. \`POST /api/payments/otp/request\` — envía el OTP al teléfono del cliente.
2. \`POST /api/payments/otp/confirm\` — confirma el débito con el OTP recibido.
3. \`GET  /api/payments/otp/status/:transactionId\` — consulta el estado de la transacción.

### Integración con otros módulos
Este módulo recibe el resumen de la póliza del **Módulo Emisión** para calcular el monto
exacto a cobrar. Después de confirmar el pago, el frontend llama al **Módulo Emisión**
para emitir la póliza definitiva.

### Autenticación (OAuth 2.0)
Este módulo está protegido. Debe incluir un **Access Token** en la cabecera HTTP \`Authorization: Bearer <token>\`.
El token se obtiene intercambiando su **API Key** en el endpoint \`/api/access/token\` del servidor central (Nexus API).

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
      { url: 'http://localhost:3001', description: 'Desarrollo local' },
    ],
    tags: [
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
          description: 'Ingrese su Access Token temporal (obtenido desde Nexus API vía /api/access/token)',
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
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
