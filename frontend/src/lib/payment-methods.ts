import type { PaymentMethod } from '../types';

type MetodoConfigEntry = {
  key?: string;
  tipo?: string;
  activo?: boolean;
};

/**
 * Indica si un método debe mostrarse según config Nexus (array o objeto legacy).
 * Sin config: todos los métodos del UI están disponibles (p. ej. mobile + otp + domiciliacion).
 */
export function isPaymentMethodEnabled(
  method: PaymentMethod,
  metodos: unknown,
): boolean {
  if (!metodos) return true;

  if (Array.isArray(metodos)) {
    const entry = (metodos as MetodoConfigEntry[]).find(
      (m) => m.key === method || m.tipo === method,
    );
    return entry?.activo ?? true;
  }

  if (typeof metodos === 'object') {
    const row = (metodos as Record<string, { activo?: boolean }>)[method];
    return row?.activo ?? true;
  }

  return true;
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePayToken(value: unknown): string {
  return stripAccents(String(value ?? '').trim()).toUpperCase();
}

const FREQ_FRACCIONADA = new Set([
  'M',
  'T',
  'S',
  'C',
  'MENSUAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'CUATRIMESTRAL',
]);
const FREQ_CONTADO = new Set(['A', 'AN', 'ANUAL', 'CONTADO']);

function frecuenciaImplicaFraccionado(frecuencia: unknown): boolean | null {
  const freq = normalizePayToken(frecuencia);
  if (!freq) return null;
  if (FREQ_FRACCIONADA.has(freq)) return true;
  if (
    freq.includes('SEMESTR')
    || freq.includes('TRIM')
    || freq.includes('MENSUAL')
    || freq.includes('CUATRIM')
  ) {
    return true;
  }
  if (FREQ_CONTADO.has(freq) || freq.includes('ANUAL') || freq.includes('CONTADO')) {
    return false;
  }
  return null;
}

/** Resuelve ifrecuencia desde SSO, bridge o wizard (rcv/funerario). */
export function resolveCheckoutFrecuencia(input: {
  checkoutPayload?: Record<string, unknown> | null;
  metadataCanal?: Record<string, unknown> | null;
  rcvFrecuencia?: unknown;
  funeralFrecuencia?: unknown;
  /** Bridge (?sid=): prioriza la frecuencia elegida en emisión sobre metadata del producto. */
  preferWizardFrecuencia?: boolean;
}): string {
  const wizardFreq = input.preferWizardFrecuencia
    ? (input.rcvFrecuencia ?? input.funeralFrecuencia)
    : undefined;
  const payload = input.checkoutPayload && typeof input.checkoutPayload === 'object'
    ? input.checkoutPayload
    : {};
  const canal = input.metadataCanal && typeof input.metadataCanal === 'object'
    ? input.metadataCanal
    : {};

  const raw = wizardFreq
    ?? payload.ifrecuencia
    ?? payload.frecuencia
    ?? canal.ifrecuencia
    ?? canal.frecuencia
    ?? input.rcvFrecuencia
    ?? input.funeralFrecuencia
    ?? 'A';

  const code = normalizePayToken(raw);
  return code.charAt(0) || 'A';
}

/**
 * Pago fraccionado (cuotas M/T/S/C):
 * - Con requireFirstPayment: cobrar 1ª cuota (móvil/OTP) y luego domiciliar.
 * - Legacy (solo domiciliacion en methods): solo domiciliación.
 * La frecuencia elegida (anual vs cuotas) prevalece sobre el flag fraccionado del producto.
 */
export function isPagoFraccionado(input: {
  fraccionado?: unknown;
  formaPago?: unknown;
  frecuencia?: unknown;
}): boolean {
  const byFreq = frecuenciaImplicaFraccionado(input.frecuencia);
  if (byFreq != null) return byFreq;

  if (input.fraccionado === true || input.fraccionado === 'true') return true;
  if (input.fraccionado === false || input.fraccionado === 'false') return false;

  const forma = normalizePayToken(input.formaPago);
  if (forma) {
    if (
      forma.includes('FRACCION') ||
      forma.includes('CUOTA') ||
      forma === 'MENSUAL' ||
      forma === 'TRIMESTRAL' ||
      forma === 'SEMESTRAL'
    ) {
      return true;
    }
    if (forma.includes('COMPLETO') || forma.includes('CONTADO') || forma === 'ANUAL') {
      return false;
    }
  }

  return false;
}
