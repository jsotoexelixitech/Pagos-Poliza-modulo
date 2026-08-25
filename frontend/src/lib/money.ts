/**
 * Helpers de formato monetario para mostrar la prima real de La Mundial.
 *
 * Regla RCV cuota: ROUND((ROUND(mprimaext,2)/cuotas)×ptasa, 2).
 * USD: 2 decimales · tasa: todos los decimales de la API.
 */
import type { PolicyQuote } from '../types';

const LOCALE = 'es-VE';

const USD = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const VES = new Intl.NumberFormat(LOCALE, {
  style: 'decimal',
  maximumFractionDigits: 2,
});

const QUOTE_USD_DECIMALS = 2;
const QUOTE_VES_DISPLAY = 2;
const QUOTE_VES_PAYMENT = 2;

export function truncateQuoteAmount(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  const adj = n >= 0 ? 1e-9 : -1e-9;
  return Math.trunc((n + adj) * factor) / factor;
}

export function roundQuoteAmount(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function normalizeQuoteUsd(usd: number): number {
  return roundQuoteAmount(usd, QUOTE_USD_DECIMALS);
}

export function resolveQuotePtasa(ptasa: number | undefined | null): number {
  if (ptasa == null || !Number.isFinite(ptasa) || ptasa <= 0) return 0;
  return ptasa;
}

export function computeQuoteVes(usd: number, ptasa: number): number {
  const rate = resolveQuotePtasa(ptasa);
  if (!Number.isFinite(usd) || rate <= 0) return 0;
  return usd * rate;
}

export function resolveQuoteVesAmount(
  usd: number | undefined | null,
  ptasa: number | undefined | null,
  fallbackMprima?: number | null,
): number {
  const rate = resolveQuotePtasa(ptasa);
  if (usd != null && Number.isFinite(usd) && rate > 0) {
    return roundQuoteAmount(computeQuoteVes(normalizeQuoteUsd(usd), rate), QUOTE_VES_PAYMENT);
  }
  return fallbackMprima ?? 0;
}

function formatFixedDecimal(n: number, displayDecimals: number, mode: 'round' | 'trunc'): string {
  const normalized =
    mode === 'round'
      ? roundQuoteAmount(n, displayDecimals)
      : truncateQuoteAmount(n, displayDecimals);
  return normalized.toLocaleString(LOCALE, {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}

function quoteTasaFractionDigits(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const fixed = n.toFixed(10).replace(/\.?0+$/, '');
  const dot = fixed.indexOf('.');
  return dot >= 0 ? fixed.length - dot - 1 : 0;
}

export function formatQuoteUsd(n: number): string {
  return formatFixedDecimal(n, QUOTE_USD_DECIMALS, 'round');
}

export function formatQuoteUsdMoney(n: number): string {
  return `$${formatQuoteUsd(n)}`;
}

export function formatQuoteVes(n: number): string {
  return formatFixedDecimal(n, QUOTE_VES_DISPLAY, 'round');
}

export function formatQuoteVesLabel(n: number): string {
  return `Bs ${formatQuoteVes(n)}`;
}

export function formatQuoteTasa(n: number): string {
  return `${formatQuoteTasaValue(n)} Bs/$`;
}

export function formatQuoteTasaValue(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const decimals = quoteTasaFractionDigits(n);
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals > 0 ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

export function formatQuoteVesPaymentInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = roundQuoteAmount(n, QUOTE_VES_PAYMENT);
  return rounded.toFixed(QUOTE_VES_PAYMENT);
}

export type Billing = 'monthly' | 'annual';

export function usdAnnual(quote: PolicyQuote | null): number {
  if (!quote) return 0;
  return normalizeQuoteUsd(quote.mprimaext);
}

export function usdMonthly(quote: PolicyQuote | null): number {
  return quote ? normalizeQuoteUsd(quote.mprimaext) / 12 : 0;
}

export function vesAnnual(quote: PolicyQuote | null): number {
  if (!quote) return 0;
  const rate = resolveQuotePtasa(quote.ptasa);
  if (rate > 0 && quote.mprimaext != null) {
    return roundQuoteAmount(
      computeQuoteVes(normalizeQuoteUsd(quote.mprimaext), rate),
      QUOTE_VES_PAYMENT,
    );
  }
  return quote.mprima ?? 0;
}

export function vesMonthly(quote: PolicyQuote | null): number {
  return quote ? vesAnnual(quote) / 12 : 0;
}

export function formatUsd(n: number): string {
  return USD.format(n);
}

export function formatVes(n: number): string {
  return `Bs ${VES.format(n)}`;
}

export function formatUsdShort(n: number): string {
  return formatQuoteUsdMoney(n);
}

export function pickDisplayAmount(
  quote: PolicyQuote | null,
  billing: Billing,
  fallback = 0,
): { usd: number; ves: number } {
  if (!quote) return { usd: fallback, ves: 0 };
  return billing === 'monthly'
    ? { usd: usdMonthly(quote), ves: vesMonthly(quote) }
    : { usd: usdAnnual(quote), ves: vesAnnual(quote) };
}

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
