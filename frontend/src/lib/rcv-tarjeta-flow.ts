import { useWizardStore } from '../store/wizardStore';
import { readFlowHandoff } from './flow-handoff';
import type { PaymentEmitContext } from '../types';

export const TARJETA_FLOW_HEADER = 'X-Rcv-Tarjeta-Flow';

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Farmatodo: pago en caja + factura OCR (bfactura=1) — no paso pago móvil en Pagos. */
export function shouldSkipPaymentForTarjetaMetadata(
  metadataCanal?: Record<string, unknown> | null,
): boolean {
  if (!metadataCanal) return false;
  if (String(metadataCanal.flujo ?? '').trim().toLowerCase() !== 'tarjeta') return false;
  return isTruthyFlag(metadataCanal.skipPayment) || isTruthyFlag(metadataCanal.bfactura);
}

export function normalizeTarjetaNfactura(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 16);
}

/** Contexto de emisión tarjeta farmacia (recibo activado con nfactura). */
export function buildTarjetaFarmaciaEmitPaymentCtx(
  metadataCanal?: Record<string, unknown> | null,
): PaymentEmitContext | undefined {
  if (!shouldSkipPaymentForTarjetaMetadata(metadataCanal)) return undefined;
  const nfactura = normalizeTarjetaNfactura(metadataCanal?.nfactura);
  const ref = nfactura || 'FARMACIA';
  return {
    paymentVerified: true,
    paymentCapture: {
      reference: ref,
      xreferencia: ref,
      tarjetaFarmacia: true,
    },
  };
}

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
  const merged = { ...(store.metadataCanal || {}), ...stored };
  const handoff = readFlowHandoff() as { tarjeta?: { nfactura?: string | null } } | null;
  const fromTarjeta = handoff?.tarjeta?.nfactura;
  if (!merged.nfactura && fromTarjeta) {
    merged.nfactura = normalizeTarjetaNfactura(fromTarjeta);
  }
  store.setMetadataCanal(merged);
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
