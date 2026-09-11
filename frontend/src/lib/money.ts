/**
 * Helpers de formato monetario para mostrar la prima real de La Mundial.
 *
 * La Mundial cotiza la prima ANUAL:
 *   - mprima    -> en Bs (VES)
 *   - mprimaext -> en USD
 *   - ptasa     -> tasa Bs/USD usada en la cotizacion
 *
 * Para el toggle "Mensual/Anual" del wizard convertimos USD anual en
 * USD/mes simplemente dividiendo entre 12 (no aplicamos descuentos
 * inventados sobre datos reales).
 */
import type { PolicyQuote } from '../types';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const VES = new Intl.NumberFormat('es-VE', {
  style: 'decimal',
  maximumFractionDigits: 2,
});

export type Billing = 'monthly' | 'annual';

export function usdAnnual(quote: PolicyQuote | null): number {
  return quote?.mprimaext ?? 0;
}
export function usdMonthly(quote: PolicyQuote | null): number {
  return quote ? quote.mprimaext / 12 : 0;
}

export function vesAnnual(quote: PolicyQuote | null): number {
  return quote?.mprima ?? 0;
}
export function vesMonthly(quote: PolicyQuote | null): number {
  return quote ? quote.mprima / 12 : 0;
}

export function formatUsd(n: number): string {
  return USD.format(n);
}

export function formatVes(n: number): string {
  return `Bs ${VES.format(n)}`;
}

/** Parsea un monto en Bs (sea número, string con coma o punto, o prefijo Bs) a número flotante real. */
export function parseVesAmount(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  }
  return parseFloat(cleaned) || 0;
}

/** Formatea un monto en formato estándar venezolano (separador de miles con punto y decimales con coma). */
export function formatVesAmount(raw: string | number | undefined | null, includePrefix = true): string {
  const num = parseVesAmount(raw);
  if (isNaN(num) || num <= 0) return '';
  const formatted = num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return includePrefix ? `Bs ${formatted}` : formatted;
}

export function formatUsdShort(n: number): string {
  // ej. "$408.29"  -> usado en bloques compactos
  return `$${n.toFixed(2)}`;
}

/**
 * Devuelve el monto a mostrar segun toggle billing y la quote actual.
 * Si no hay quote, retorna `fallback` (para no romper UIs durante carga).
 */
export function pickDisplayAmount(
  quote: PolicyQuote | null,
  billing: Billing,
  fallback = 0
): { usd: number; ves: number } {
  if (!quote) return { usd: fallback, ves: 0 };
  return billing === 'monthly'
    ? { usd: usdMonthly(quote), ves: vesMonthly(quote) }
    : { usd: usdAnnual(quote), ves: vesAnnual(quote) };
}

/**
 * Firma del vehiculo usada para invalidar la quote en el store cuando cambian
 * datos relevantes para la cotizacion. Debe coincidir con lo que se mira en
 * setVehicle del store.
 */
export function vehicleSignature(v: {
  placa: string;
  marca: string;
  modelo: string;
  año: string;
  uso: string;
  cversion?: string;
  ccategoria_uso?: number | string;
}): string {
  return `${v.placa}|${v.marca}|${v.modelo}|${v.año}|${v.uso}|${v.cversion ?? ''}|${v.ccategoria_uso ?? ''}`.toUpperCase();
}
