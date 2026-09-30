import type { ProveedorItem, RegisterPolicyProveedorDto, WizardState } from '../types';
import { useWizardStore } from '../store/wizardStore';
import { isCombinadoFamiliar } from './product';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ResolvedProveedorData {
  selectedProveedor: ProveedorItem | null;
  cproveedor?: number | string;
  xproveedor?: string;
  cplan_proveedor?: string;
  cramo_proveedor?: number;
  cclave_num?: number;
  itiposerv?: string;
  hasProveedor: boolean;
}

type ProvSource = Record<string, any> | null | undefined;

const parseNum = (val: unknown): number | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
};

const firstStr = (...vals: unknown[]): string | undefined => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
};

/**
 * Resuelve el proveedor del flujo desde store, checkoutPayload, metadataCanal, funeral y selectedPlan.
 * Solo datos enviados por el integrador (no query params ni valores por defecto).
 */
export function resolveProveedorData(stateOrSnap?: WizardState | null): ResolvedProveedorData {
  const snap = stateOrSnap ?? useWizardStore.getState();
  const sources: ProvSource[] = [
    snap?.checkoutPayload,
    snap?.metadataCanal,
    snap?.funeral as ProvSource,
    snap?.selectedPlan as ProvSource,
  ];

  const rawProveedor: ProveedorItem | undefined =
    snap?.selectedProveedor
    ?? sources.map((s) => (s?.selectedProveedor ?? s?.proveedor) as ProveedorItem | undefined).find(Boolean);

  const fromSources = (key: string) => sources.map((s) => s?.[key]);

  const cproveedor = firstStr(snap?.cproveedor, rawProveedor?.cci_rif, rawProveedor?.cproveedor, ...fromSources('cproveedor'));
  const xproveedor = firstStr(snap?.xproveedor, rawProveedor?.xproveedor, rawProveedor?.xcliente, ...fromSources('xproveedor'));
  const cplan_proveedor = firstStr(
    snap?.cplan_proveedor, rawProveedor?.cplan, rawProveedor?.cplan_proveedor, ...fromSources('cplan_proveedor'), snap?.selectedPlan?.cplan,
  );
  const cramo_proveedor = [snap?.cramo_proveedor, rawProveedor?.cramo, rawProveedor?.cramo_proveedor, ...fromSources('cramo_proveedor')]
    .map(parseNum).find((n) => n !== undefined);
  const cclave_num = [snap?.cclave_num, rawProveedor?.cclave_num, ...fromSources('cclave_num')]
    .map(parseNum).find((n) => n !== undefined);
  const itiposerv = firstStr(snap?.itiposerv, rawProveedor?.itiposerv, ...fromSources('itiposerv'));

  const hasProveedor = Boolean(rawProveedor || cproveedor);

  const selectedProveedor: ProveedorItem | null =
    rawProveedor
    ?? (cproveedor
      ? {
          cci_rif: cproveedor,
          xproveedor: xproveedor ?? '',
          xcliente: xproveedor ?? '',
          cplan: cplan_proveedor,
          cramo: cramo_proveedor,
          cclave_num,
          itiposerv,
        }
      : null);

  return { selectedProveedor, cproveedor, xproveedor, cplan_proveedor, cramo_proveedor, cclave_num, itiposerv, hasProveedor };
}

/** Registra proveedor en póliza solo para producto 51 / Combinado Familiar con proveedor informado. */
export function shouldRegisterProveedor(stateOrSnap?: WizardState | null): boolean {
  const snap = stateOrSnap ?? useWizardStore.getState();
  const cproducto =
    snap?.metadataCanal?.cproducto ?? snap?.selectedPlan?.cproducto ?? snap?.checkoutPayload?.cproducto;
  const isProducto51 = String(cproducto).trim() === '51' || Number(cproducto) === 51 || isCombinadoFamiliar();
  return resolveProveedorData(snap).hasProveedor && isProducto51;
}

/** Copia al store el proveedor que llegue en un payload del integrador (bridge / SSO). */
export function applyProveedorFromPayload(data: Record<string, any> | null | undefined): void {
  if (!data || !(data.cproveedor || data.selectedProveedor || data.proveedor)) return;
  const provObj = (data.selectedProveedor ?? data.proveedor) as Record<string, any> | undefined;
  const cprov = data.cproveedor ?? provObj?.cci_rif ?? provObj?.cproveedor;
  if (!cprov) return;
  useWizardStore.getState().setCproveedor(cprov, firstStr(provObj?.xproveedor, provObj?.xcliente, data.xproveedor), {
    cplan: firstStr(provObj?.cplan, data.cplan_proveedor),
    cramo: parseNum(provObj?.cramo ?? data.cramo_proveedor),
    cclave_num: parseNum(provObj?.cclave_num ?? data.cclave_num),
    itiposerv: firstStr(provObj?.itiposerv, data.itiposerv),
  });
}

/**
 * Arma el registro de proveedor en póliza (adproveedor).
 * Sin valores de relleno: si falta un dato lanza error y no se escribe en Sis2000.
 */
export function buildRegisterPolicyProveedorPayload(
  policy: { cnpoliza?: string | number; number?: string | number },
  stateOrSnap?: WizardState | null,
  opts?: { quote?: { mprima?: unknown; mprimaext?: unknown; ptasa?: unknown } | null; fallbackCramo?: number },
): RegisterPolicyProveedorDto {
  const snap = stateOrSnap ?? useWizardStore.getState();
  const prov = resolveProveedorData(snap);
  const quote = opts?.quote ?? snap?.quote;

  const poliza = policy.cnpoliza || policy.number;
  const now = new Date();
  const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const cciRif = Number(String(prov.selectedProveedor?.cci_rif ?? prov.cproveedor ?? '').replace(/\D/g, ''));
  const claveNum = Number(prov.selectedProveedor?.cclave_num ?? prov.cclave_num);
  const tipoServ = String(prov.selectedProveedor?.itiposerv ?? prov.itiposerv ?? '').trim();
  const plan = String(prov.selectedProveedor?.cplan ?? prov.cplan_proveedor ?? '').trim();
  const ramo = Number(prov.selectedProveedor?.cramo ?? prov.cramo_proveedor ?? opts?.fallbackCramo);
  const usuario = Number(snap?.metadataCanal?.cusuario);
  const mcosto = Number(quote?.mprima);
  const mcostoext = Number(quote?.mprimaext ?? snap?.selectedPlan?.priceNum);
  const ptasamon = Number(quote?.ptasa);

  const faltantes = ([
    ['póliza', Boolean(poliza)],
    ['RIF del proveedor', cciRif > 0],
    ['clave del proveedor', claveNum > 0],
    ['tipo de servicio', Boolean(tipoServ)],
    ['plan', Boolean(plan)],
    ['ramo', ramo > 0],
    ['usuario (cusuario)', usuario > 0],
    ['prima', mcosto > 0 && mcostoext > 0],
    ['tasa', ptasamon > 0],
  ] as const).filter(([, ok]) => !ok).map(([label]) => label);
  if (!poliza || faltantes.length > 0) {
    throw new Error(`Faltan datos para registrar el proveedor: ${faltantes.join(', ')}.`);
  }

  return {
    cpoliza: poliza,
    fanopol: now.getFullYear(),
    fmespol: now.getMonth() + 1,
    cramo: ramo,
    ccerti: 1,
    cplan: plan,
    u_version: 'A',
    fdesde: now.toISOString().split('T')[0],
    fhasta: nextYear.toISOString().split('T')[0],
    cci_rif: cciRif,
    cclave_num: claveNum,
    itiposerv: tipoServ,
    mcosto,
    mcostoext,
    cmoneda: 'D',
    ptasamon,
    fingreso: now.toISOString(),
    cusuario: usuario,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
