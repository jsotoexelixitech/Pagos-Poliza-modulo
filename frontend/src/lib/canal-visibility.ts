/** Visibilidad de canal (nest-api GET /canal/visibility). */
import { isBridgeChained } from './bridge-session';
export type MetodoPagoExelixi =
  | 'mobile'
  | 'otp'
  | 'domiciliacion'
  | 'mobile_bancamiga'
  | 'ubii';

export type TipoEmisionCanal =
  | 'emit'
  | 'emit_pay'
  | 'emit_libre_pago'
  | 'emit_convenio'
  | 'emit_garage_plus';

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
  tipoEmision: TipoEmisionCanal | string | null;
  tipoPago: string[];
  planes: Array<{
    cplan: string;
    cramo: number;
    xplan?: string;
    cproducto?: string;
  }>;
  ui: CanalVisibilityUi;
}

function mapTipoPagoToMetodos(tipoPago: string[]): MetodoPagoExelixi[] {
  const metodos = new Set<MetodoPagoExelixi>();
  for (const raw of tipoPago) {
    const value = String(raw).trim().toLowerCase();
    if (value.includes('meritop') || value.includes('activo')) metodos.add('mobile');
    if (value.includes('sypago')) {
      metodos.add('otp');
      metodos.add('domiciliacion');
    }
    if (value.includes('bancamiga')) metodos.add('mobile_bancamiga');
    if (value.includes('ubii')) metodos.add('ubii');
  }
  return [...metodos];
}

export function resolveAllowedPaymentMethods(
  canalVisibility: CanalVisibility | null | undefined,
): MetodoPagoExelixi[] | null {
  if (!canalVisibility) return null;
  const fromUi = canalVisibility.ui?.metodosPago;
  if (fromUi?.length) return fromUi;
  if (canalVisibility.tipoPago?.length) {
    return mapTipoPagoToMetodos(canalVisibility.tipoPago);
  }
  return null;
}

/** Solo aplica reglas Sis2000 en flujo bridge (?sid=). Standalone ignora canalVisibility. */
export function effectiveCanalVisibility(
  canalVisibility: CanalVisibility | null | undefined,
): CanalVisibility | null | undefined {
  if (!isBridgeChained()) return null;
  return canalVisibility;
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
  const effective = effectiveCanalVisibility(canalVisibility);
  if (!effective?.ui) return null;
  if (!effective.ui.mostrarPasoPago) return false;
  return effective.ui.requierePagoVerificado;
}

export function shouldShowPaymentStep(
  canalVisibility: CanalVisibility | null | undefined,
): boolean | null {
  const effective = effectiveCanalVisibility(canalVisibility);
  if (!effective?.ui) return null;
  return effective.ui.mostrarPasoPago;
}

export function isCanalPaymentMethodAllowed(
  method: string,
  canalVisibility: CanalVisibility | null | undefined,
): boolean {
  const effective = effectiveCanalVisibility(canalVisibility);
  const allowed = resolveAllowedPaymentMethods(effective);
  if (!allowed?.length) return true;
  return allowed.includes(method as MetodoPagoExelixi);
}

/** Etiqueta legible del tipo de emisión Sis2000 (matipoemision). */
export function labelTipoEmision(tipo: string | null | undefined): string | null {
  switch (tipo) {
    case 'emit': return 'Emisión pendiente';
    case 'emit_pay': return 'Emisión paga';
    case 'emit_libre_pago': return 'Emisión libre pago';
    case 'emit_convenio': return 'Emisión convenio';
    case 'emit_garage_plus': return 'Emisión + Garage Plus';
    default: return null;
  }
}
