import type { PaymentMethod } from '../types';

type MetodoConfigEntry = {
  key?: string;
  tipo?: string;
  activo?: boolean;
};

/**
 * Indica si un método debe mostrarse según config Nexus (array o objeto legacy).
 * Sin config: todos los métodos del UI están disponibles (p. ej. mobile + otp).
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
