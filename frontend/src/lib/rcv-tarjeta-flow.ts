import type { PaymentCapture } from '../types';
import { useWizardStore } from '../store/wizardStore';
import { readFlowHandoff } from './flow-handoff';

export const TARJETA_FLOW_HEADER = 'X-Rcv-Tarjeta-Flow';

const TARJETA_SESSION_KEY = 'rcv_tarjeta_public_flow';
const TARJETA_METADATA_KEY = 'rcv_tarjeta_metadata_canal';

export function readTarjetaMetadataCanal(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(TARJETA_METADATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function hydrateTarjetaMetadataCanal(): void {
  if (!shouldUseTarjetaPublicApi()) return;
  const stored = readTarjetaMetadataCanal();
  if (!stored?.cplan) return;
  const store = useWizardStore.getState();
  // Handoff (nfactura tras validate-bill) prevalece sobre sessionStorage de la tarjeta.
  store.setMetadataCanal({ ...stored, ...(store.metadataCanal || {}) });
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Metadata tarjeta: sessionStorage + store (handoff emisión). */
export function resolveTarjetaPaymentMeta(
  metadataCanal?: Record<string, unknown> | null,
): Record<string, unknown> {
  const storeMeta = useWizardStore.getState().metadataCanal;
  return {
    ...(readTarjetaMetadataCanal() || {}),
    ...(metadataCanal || {}),
    ...(storeMeta || {}),
  };
}

/**
 * bfactura=1: pago en farmacia al validar factura OCR.
 * Requiere nfactura en metadata (validate-bill OK).
 */
export function shouldSkipTarjetaPayment(
  metadataCanal?: Record<string, unknown> | null,
): boolean {
  if (!shouldUseTarjetaPublicApi()) return false;
  const meta = resolveTarjetaPaymentMeta(metadataCanal);
  if (!isTruthyFlag(meta.skipPayment) && !isTruthyFlag(meta.bfactura)) return false;
  return Boolean(String(meta.nfactura ?? '').trim());
}

export function buildTarjetaFarmaciaPaymentCapture(
  metadataCanal?: Record<string, unknown> | null,
): PaymentCapture | null {
  const meta = resolveTarjetaPaymentMeta(metadataCanal);
  const nfactura = String(meta.nfactura ?? '').trim();
  if (!nfactura) return null;
  return {
    reference: nfactura,
    method: 'mobile',
    paidOn: new Date().toISOString().slice(0, 10),
  };
}

/** Marca pago verificado cuando la factura farmacia ya fue validada en OCR. */
export function applyTarjetaFarmaciaPaymentSkip(): boolean {
  if (!shouldUseTarjetaPublicApi()) return false;
  const store = useWizardStore.getState();
  if (!shouldSkipTarjetaPayment(store.metadataCanal)) return false;
  if (store.paymentVerified && store.paymentCapture?.reference) return true;

  const capture = buildTarjetaFarmaciaPaymentCapture(store.metadataCanal);
  if (!capture) return false;

  store.setPaymentVerified(true);
  store.setPaymentCapture(capture);
  return true;
}

export type TarjetaPlanCurrencyKind = 'usd' | 'ves';

export function resolveTarjetaPlanCurrency(cmoneda?: unknown): TarjetaPlanCurrencyKind {
  const code = String(cmoneda ?? '$').trim().toUpperCase();
  if (code === 'BS' || code === 'B' || code === 'BOLIVAR' || code === 'BOLÍVAR' || code === 'VES') {
    return 'ves';
  }
  return 'usd';
}

export function getTarjetaPlanCmoneda(metadataCanal?: Record<string, unknown> | null): string {
  const meta = metadataCanal ?? readTarjetaMetadataCanal();
  const raw = meta?.cmoneda;
  return raw != null && String(raw).trim() ? String(raw).trim() : '$';
}

export function tarjetaQuoteShowsVes(cmoneda?: unknown): boolean {
  return resolveTarjetaPlanCurrency(cmoneda) === 'ves';
}

export function isTarjetaRcvFlow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flujo = (params.get('flujo') || params.get('entrada') || '').trim().toLowerCase();
    if (flujo === 'tarjeta') return true;
    return sessionStorage.getItem(TARJETA_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function shouldUseTarjetaPublicApi(): boolean {
  return isTarjetaRcvFlow();
}

export function markTarjetaPublicSession(): void {
  try {
    sessionStorage.setItem(TARJETA_SESSION_KEY, '1');
    sessionStorage.setItem('exelixi_product', 'rcv');
  } catch {
    /* ignore */
  }
}

export function withTarjetaFlowQuery(url: string): string {
  if (!isTarjetaRcvFlow()) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('flujo', 'tarjeta');
    if (!u.searchParams.get('product')) u.searchParams.set('product', 'rcv');
    return u.toString();
  } catch {
    return url;
  }
}

export function hydrateTarjetaHandoff(): void {
  if (!shouldUseTarjetaPublicApi()) return;
  const local = readFlowHandoff();
  if (!local) return;
  const set = (useWizardStore as unknown as { setState: (p: Record<string, unknown>) => void }).setState;
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(local)) {
    if (k !== 'step' && typeof v !== 'function') filtered[k] = v;
  }
  set(filtered);
}
