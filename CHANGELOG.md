# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
