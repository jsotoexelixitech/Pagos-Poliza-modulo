import { useWizardStore } from '../store/wizardStore';
import { readFlowHandoff } from './flow-handoff';

export const TARJETA_FLOW_HEADER = 'X-Rcv-Tarjeta-Flow';

const TARJETA_SESSION_KEY = 'rcv_tarjeta_public_flow';

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
