/** Visibilidad de canal (nest-api GET /canal/visibility). */
import { isBridgeChained } from './bridge-session';
import { getSsoMetadataFromBrowser } from './sso-metadata';

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

/** Store + JWT SSO (SysIP marketplace suele traer centidad/citem solo en el token). */
export function resolveCanalMetadata(
  metadataCanal?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const fromToken = getSsoMetadataFromBrowser() || {};
  const merged = { ...fromToken, ...(metadataCanal || {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Aplica reglas Sis2000 cuando hay contexto de canal/gestor:
 * - flujo bridge (?sid=), o
 * - SSO SysIP con centidad/citem en metadata (store o token).
 */
export function shouldApplyCanalRules(
  metadataCanal?: Record<string, unknown> | null,
): boolean {
  if (isBridgeChained()) return true;
  return resolveEntityFromMetadata(resolveCanalMetadata(metadataCanal)) != null;
}

/** true si la visibilidad cargada corresponde a la entidad activa (C/1 vs P/215). */
export function visibilityMatchesEntity(
  canalVisibility: CanalVisibility | null | undefined,
  entity: { centidad: string; citem: string } | null,
): boolean {
  if (!canalVisibility || !entity) return false;
  const centidad = String(canalVisibility.centidad ?? '').trim().toUpperCase();
  const citem = String(canalVisibility.citem ?? '').trim();
  return centidad === entity.centidad && citem === entity.citem;
}

/** Ignora canalVisibility si no hay contexto Sis2000 o la entidad no coincide. */
export function effectiveCanalVisibility(
  canalVisibility: CanalVisibility | null | undefined,
  metadataCanal?: Record<string, unknown> | null,
): CanalVisibility | null | undefined {
  if (!shouldApplyCanalRules(metadataCanal)) return null;
  const entity = resolveEntityFromMetadata(resolveCanalMetadata(metadataCanal));
  if (entity && canalVisibility && !visibilityMatchesEntity(canalVisibility, entity)) {
    return null;
  }
  return canalVisibility;
}

export function resolveCanalEntity(
  metadataCanal?: Record<string, unknown> | null,
): { centidad: string; citem: string } | null {
  return resolveEntityFromMetadata(resolveCanalMetadata(metadataCanal));
}

/** tipoEmision `emit`: puede emitir sin pago verificado (recibo pendiente en Sis2000). */
export function allowsEmitPending(
  canalVisibility: CanalVisibility | null | undefined,
  metadataCanal?: Record<string, unknown> | null,
): boolean {
  const effective = effectiveCanalVisibility(canalVisibility, metadataCanal);
  if (!effective?.ui) return false;
  if (!effective.ui.mostrarPasoPago) return false;
  return (
    effective.tipoEmision === 'emit'
    && !effective.ui.requierePagoVerificado
  );
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
    ?? (centidad === 'P' ? metadata.cproductor : null)
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
  metadataCanal?: Record<string, unknown> | null,
): boolean | null {
  const effective = effectiveCanalVisibility(canalVisibility, metadataCanal);
  if (!effective?.ui) return null;
  if (!effective.ui.mostrarPasoPago) return false;
  return effective.ui.requierePagoVerificado;
}

export function shouldShowPaymentStep(
  canalVisibility: CanalVisibility | null | undefined,
  metadataCanal?: Record<string, unknown> | null,
): boolean | null {
  const effective = effectiveCanalVisibility(canalVisibility, metadataCanal);
  if (!effective?.ui) return null;
  return effective.ui.mostrarPasoPago;
}

export function isCanalPaymentMethodAllowed(
  method: string,
  canalVisibility: CanalVisibility | null | undefined,
  metadataCanal?: Record<string, unknown> | null,
): boolean {
  const effective = effectiveCanalVisibility(canalVisibility, metadataCanal);
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
