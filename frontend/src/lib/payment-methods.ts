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

const FREQ_FRACCIONADA = new Set(['M', 'T', 'S', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL']);
const FREQ_CONTADO = new Set(['A', 'C', 'ANUAL', 'CONTADO']);

/**
 * Pago fraccionado (cuotas M/T/S):
 * - Con requireFirstPayment: cobrar 1ª cuota (móvil/OTP) y luego domiciliar.
 * - Legacy (solo domiciliacion en methods): solo domiciliación.
 */
export function isPagoFraccionado(input: {
  fraccionado?: unknown;
  formaPago?: unknown;
  frecuencia?: unknown;
}): boolean {
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

  const freq = normalizePayToken(input.frecuencia);
  if (FREQ_FRACCIONADA.has(freq)) return true;
  if (FREQ_CONTADO.has(freq)) return false;

  return false;
}
