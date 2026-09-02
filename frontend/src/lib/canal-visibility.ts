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
  centidad: string;
  citem: string;
  ccanalalt?: number | null;
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

/** Entidad Sis2000 para visibilidad: gestor (P), canal (C) o legacy ccanalalt. */
export function resolveEntityFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { centidad: string; citem: string } | null {
  if (!metadata) return null;

  const centidad = metadata.centidad != null
    ? String(metadata.centidad).trim().toUpperCase()
    : '';
  const citemRaw = metadata.citem
    ?? (centidad === 'C' ? (metadata.ccanalalt_in ?? metadata.ccanalalt) : null);
  const citem = citemRaw != null && citemRaw !== '' ? String(citemRaw).trim() : '';

  if (centidad && citem) {
    return { centidad, citem };
  }

  const ccanalalt = resolveCcanalaltFromMetadata(metadata);
  if (ccanalalt) {
    return { centidad: 'C', citem: String(ccanalalt) };
  }

  const productor = metadata.cproductor;
  const cproducto = metadata.cproducto != null ? String(metadata.cproducto).trim() : '';
  if (productor != null && productor !== '' && cproducto) {
    return { centidad: 'P', citem: String(productor).trim() };
  }

  return null;
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
