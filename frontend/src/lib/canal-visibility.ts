/** Visibilidad de canal (nest-api GET /canal/visibility). */
export type MetodoPagoExelixi =
  | 'mobile'
  | 'otp'
  | 'domiciliacion'
  | 'mobile_bancamiga'
  | 'ubii';

export interface CanalVisibilityUi {
  mostrarPasoPago: boolean;
  requierePagoVerificado: boolean;
  metodosPago: MetodoPagoExelixi[];
  planesPermitidos: string[];
}

export interface CanalVisibility {
  ccanalalt: number;
  cscanalalt?: number | null;
  cproducto?: string;
  cramo?: number;
  tipoEmision: string | null;
  tipoPago: string[];
  planes: Array<{
    cplan: string;
    cramo: number;
    xplan?: string;
    cproducto?: string;
  }>;
  ui: CanalVisibilityUi;
}

export function resolveCcanalaltFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  if (!metadata) return null;
  const raw = metadata.ccanalalt_in ?? metadata.ccanalalt;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export function shouldRequirePaymentVerification(
  canalVisibility: CanalVisibility | null | undefined,
): boolean | null {
  if (!canalVisibility?.ui) return null;
  if (!canalVisibility.ui.mostrarPasoPago) return false;
  return canalVisibility.ui.requierePagoVerificado;
}

export function shouldShowPaymentStep(
  canalVisibility: CanalVisibility | null | undefined,
): boolean | null {
  if (!canalVisibility?.ui) return null;
  return canalVisibility.ui.mostrarPasoPago;
}

export function isCanalPaymentMethodAllowed(
  method: string,
  canalVisibility: CanalVisibility | null | undefined,
): boolean {
  const allowed = canalVisibility?.ui?.metodosPago;
  if (!allowed?.length) return true;
  return allowed.includes(method as MetodoPagoExelixi);
}
