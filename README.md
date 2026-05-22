# 💳 Módulo Pagos / Póliza — Exelixi Platform

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![PM2](https://img.shields.io/badge/PM2-ready-2B037A?style=flat-square)

**Pasos 5 y 6 del flujo RCV · Pagos, verificación y pantalla de éxito**

[Documentación de la API](#-api-reference) · [Despliegue](#-despliegue) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## 📋 Descripción

El módulo Pagos es el **paso final** del flujo de contratación RCV. Permite al usuario elegir su método de pago, verifica el cobro en tiempo real y presenta la pantalla de éxito con los datos de la póliza emitida.

### Métodos de pago soportados

| Método | Proveedor | Estado |
|:-------|:----------|:------:|
| Pago Móvil | Meritop / Banco Activo | 🟡 QA |
| Débito OTP  | SyPago               | 🟡 Pendiente prod |

### Características principales

- ✅ Verificación de Pago Móvil via Meritop (Banco Activo)
- ✅ Débito OTP via SyPago con flujo de confirmación en 2 pasos
- ✅ Pantalla de éxito con datos de póliza y descarga PDF
- ✅ Integración directa con Módulo Emisión (puerto 4004)
- ✅ API REST documentada con Swagger/OpenAPI
- ✅ Gestión de procesos con PM2

---

## 🏗️ Arquitectura

```
modulo-pagos/
├── frontend/                    # React 18 + Vite 5 + TailwindCSS
│   ├── src/
│   │   ├── features/payment/    # PaymentStep + SuccessStep
│   │   ├── features/plans/      # PlansStep
│   │   ├── features/emission/   # EmissionStep (datos tomador)
│   │   └── ...
│   └── dist/
├── server/                      # Node.js 20 + Express
│   ├── src/
│   │   ├── routes/              # /api/payments
│   │   ├── services/            # Meritop + SyPago adapters
│   │   └── ...
│   ├── .env.example
│   └── ...
├── logs/
├── ecosystem.config.js
├── ecosystem.dev.config.js
└── package.json
```

| Componente | Puerto | Proceso PM2   |
|:-----------|:------:|:-------------:|
| Backend API | `4003` | `pagos-api`  |
| Frontend    | `5184` | `pagos-web`  |
| Swagger UI  | `4003/docs` | — |

---

## 🚀 Inicio rápido

### Prerrequisitos

| Herramienta | Versión mínima |
|:------------|:--------------:|
| Node.js     | 20.x           |
| npm         | 10.x           |
| PM2         | 5.x            |

### 1. Clonar el repositorio

```bash
git clone https://github.com/jsotoexelixitech/Pagos-Poliza-modulo.git
cd Pagos-Poliza-modulo
```

### 2. Instalar dependencias

```bash
npm install --prefix server
npm install --prefix frontend
```

### 3. Configurar variables de entorno

```bash
cp server/.env.example server/.env
```

Edita `server/.env`:

```env
NODE_ENV=production
PORT=4003
CORS_ORIGINS=http://localhost:5184

# Meritop — Pago Móvil (Banco Activo)
MERITOP_URL=http://172.30.147.26:9020
MERITOP_URL2=http://172.30.149.18:9040
MERITOP_APIKEY=TU_APIKEY_MERITOP
MERITOP_IP=IP_DEL_SERVIDOR
MERITOP_ENABLED=true

# SyPago — Débito OTP (pendiente credenciales productivas)
# SYPAGO_URL=https://api.sypago.com
# SYPAGO_TOKEN=TU_TOKEN_SYPAGO
```

> ⚠️ **Nunca comitas el archivo `.env` al repositorio.**

### 4. Compilar el frontend

```bash
npm run build --prefix frontend
```

### 5. Levantar con PM2

```bash
# Producción
pm2 start ecosystem.config.js --env production

# Desarrollo (hot-reload)
pm2 start ecosystem.dev.config.js
```

### 6. Verificar

```bash
curl http://localhost:4003/api/health
# {"status":"ok","module":"pagos","meritop":{"enabled":true,"mock":false},"sypago":{"mock":false}}
```

Probar verificación de Pago Móvil:

```bash
curl -X POST http://localhost:4003/api/payments/verify-mobile \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePhoneNumber": "04141234567",
    "bankCode": "0102",
    "amount": 62.80,
    "paidOn": "2026-05-08T10:00:00Z"
  }'
```

---

## 📖 API Reference

### `GET /api/health`
Estado del servicio y configuración de integraciones.

### `POST /api/payments/verify-mobile`
Verifica un Pago Móvil contra Meritop / Banco Activo.

**Request body**
```json
{
  "sourcePhoneNumber": "04141234567",
  "bankCode": "0102",
  "amount": 62.80,
  "paidOn": "2026-05-08T10:00:00Z"
}
```

**Response `200`**
```json
{
  "isVerified": true,
  "reference": "REF-20260508-001",
  "verifiedAmount": 62.80,
  "verifiedOn": "2026-05-08T10:05:00Z"
}
```

### `POST /api/payments/otp/request`
Solicita la clave OTP a SyPago para débito directo.

### `POST /api/payments/otp/confirm`
Confirma el débito con la OTP recibida por el usuario.

La especificación completa está en **Swagger UI**: `http://localhost:4003/docs`

---

## 💳 Estado de integraciones

| Servicio | Estado | Notas |
|:---------|:------:|:------|
| Pago Móvil (Meritop) | 🟡 QA | Funcional en entorno de pruebas |
| Débito OTP (SyPago)  | 🟡 Pendiente | Endpoints listos, credenciales prod pendientes |
| Emisión de póliza    | ✅ Activo | Llamado al Módulo Emisión (puerto 4004) |

---

## 🛠️ Gestión de procesos (PM2)

```bash
pm2 show pagos-api
pm2 show pagos-web
pm2 logs pagos-api
pm2 restart pagos-api
pm2 restart pagos-web
pm2 save
```

---

## 📁 Logs en disco

```
logs/
├── pagos-api.out.log
├── pagos-api.err.log
├── pagos-web.out.log
└── pagos-web.err.log
```

---

## 🔄 Actualizar el módulo

```bash
git pull origin main
npm install --prefix server
npm run build --prefix frontend
pm2 restart pagos-api
pm2 restart pagos-web
```

---

## 🗺️ Módulos relacionados

| # | Módulo | Repositorio |
|:-:|:-------|:-----------|
| 1 | OCR | [ocr-documentos-modulo](https://github.com/jsotoexelixitech/ocr-documentos-modulo) |
| 2-3 | Formulario | [Formulario-modulo](https://github.com/jsotoexelixitech/Formulario-modulo) |
| 4 | Emisión / Plan | [Emision-Plan-modulo](https://github.com/jsotoexelixitech/Emision-Plan-modulo) |
| **5-6** | **Pagos / Póliza** ← _estás aquí_ | [Pagos-Poliza-modulo](https://github.com/jsotoexelixitech/Pagos-Poliza-modulo) |

---

## 🤝 Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo y convenciones.

---

## 📄 Licencia

Distribuido bajo la licencia **MIT**. Consulta [LICENSE](LICENSE).

---

<div align="center">
Desarrollado por <strong>Exelixi Tech</strong> · 2026
</div>
