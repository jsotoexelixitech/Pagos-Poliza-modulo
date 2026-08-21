# `@exelixi/shared` — Contratos de comunicacion

Libreria minima que usan los modulos Exelixi SOLO para comunicarse entre si.
Cada modulo sigue siendo 100% independiente: tiene su propio frontend, backend,
dependencias y despliegue. `shared` solo aporta tipado y el bus de eventos.

## Contenido

```
src/
  lib/
    protocol.ts   → tipos TypeScript de los mensajes entre modulos
    event-bus.ts  → bus basado en CustomEvent + BroadcastChannel
  index.ts        → re-exporta todo lo anterior
```

## Que NO contiene

- No UI (sin componentes React)
- No stores (sin Zustand)
- No logica de negocio
- No dependencias externas (cero imports de npm)

## Como funciona la comunicacion

Dos mecanismos complementarios:

### 1. Event Bus (tiempo real, mismo tab/origen)
Cuando un modulo completa su paso publica un evento:

```ts
import { publish } from '../../shared/src/index';

// En modulo-ocr, al terminar el OCR:
publish({
  source: 'ocr',
  type: 'ocr:complete',
  payload: { documents: [...] },
});

// En modulo-formulario, escuchando al ocr:
import { subscribe } from '../../shared/src/index';

useEffect(() => {
  const off = subscribe('ocr:complete', (msg) => {
    if (msg.type === 'ocr:complete') prefillFromDocuments(msg.payload.documents);
  });
  return off; // cleanup
}, []);
```

### 2. Bridge HTTP (?sid=)
Para navegacion entre modulos en tabs separados, el bridge del mock-server
transfiere el WizardStore completo via sessionId. Ver `src/lib/bridge.ts`
en cada modulo.

## Uso

```ts
// Import directo (relativo)
import { publish, subscribe } from '../../shared/src/index';
import type { OcrDocumentResult } from '../../shared/src/lib/protocol';
```
