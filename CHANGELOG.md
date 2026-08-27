# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.1.0] — 2026-08-27

### Added
- **Domiciliación SyPago** como método de pago oficial en el frontend (`PaymentMethod = 'domiciliacion'`)
- Opción "Domiciliación · SyPago · Débito automático de recibos" visible en el selector de métodos
- Endpoint `POST /api/domiciliacion/registrar` para afiliación bancaria al cobro automático de recibos fraccionados
- Variable de entorno `DOMICILIACION_API_URL` requerida para el servicio de domiciliación
- Soporte de Checkout SSO (Nexus) para inyectar `rules.methods: ['domiciliacion']` desde el portal origen

### Changed
- `PAYMENT_OPTIONS` en `PaymentStep.tsx` ahora expone Domiciliación como tercer método seleccionable
- `PaymentMethod` type extendido para incluir `'domiciliacion'`
- Árbol de componentes actualizado: `features/payment/` incluye `DomiciliacionForm.tsx`
- Variables de entorno del backend actualizadas a nombres canónicos (`LAMUNDIAL_PAYMENTS_*`, `SYPAGO_*`)
- README: arquitectura, `.env.example` y tabla de integraciones actualizadas

### Fixed
- Bug en `App.tsx`: redirección post-pago solo se ejecuta cuando `mode === 'redirect'` (antes redirigía con cualquier URL)
- Validaciones redundantes eliminadas en `DomiciliacionForm.handleAutorizar` (ya cubiertas por `puedeEnviar`)
- `getGenericCheckoutReturnUrl` refactorizado: `payload.returnUrl` evaluado una sola vez como fallback general

### Refactored
- Extraído `handlePaymentSuccessActions()` en `PaymentStep.tsx`: consolida la secuencia `triggerAutoEmit → notifyClientCheckoutStatus → scheduleGenericCheckoutReturn` usada por los tres métodos de pago
- Añadido comentario explicativo en `main.tsx` sobre por qué se omite `NexusGuard` en modo DEV

---

## [1.0.0] — 2026-05-22

### Added
- Verificación de Pago Móvil via Meritop / Banco Activo
- Flujo de Débito OTP via SyPago: solicitud + confirmación en 2 pasos
- Countdown de reenvío de OTP (60 s)
- Pantalla de éxito con datos de póliza emitida y botón de descarga PDF
- Selector visual de método de pago con estados de verificación
- Integración con Módulo Emisión para la emisión final de la póliza
- API REST documentada con Swagger/OpenAPI 3.0
- Health-check endpoint `GET /api/health`
- Soporte PM2 producción y desarrollo
