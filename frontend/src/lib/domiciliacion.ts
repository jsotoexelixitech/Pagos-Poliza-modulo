import axios, { AxiosError } from 'axios';
import { moduleApiBase } from './app-base';
import { attachNexusTokenAxios } from './nexus-token-client';
import type { CheckoutData, PaymentCapture } from '../types';

const api = axios.create({ baseURL: `${moduleApiBase()}/domiciliacion` });
attachNexusTokenAxios(api, 'nexus_access_token_pagos');

export const NUMERO_CUENTA_DIGITOS = 20;

const LETRAS_DOC_SYPAGO = new Set(['V', 'J', 'E', 'G', 'P']);

/**
 * Misma normalización que el módulo original de domiciliación:
 * `L-########` con V, J, E, G, P y hasta 9 dígitos.
 */
export function formatearCedulaRifDomiciliacion(raw: string, prev = ''): string {
  const stripped = raw.toUpperCase().replace(/[^VJEGP0-9]/g, '');
  if (!stripped) return '';

  const letra = LETRAS_DOC_SYPAGO.has(stripped[0]) ? stripped[0] : '';
  if (!letra) return '';

  const numeros = stripped.slice(1).replace(/\D/g, '').slice(0, 9);

  if (
    !numeros &&
    prev === `${letra}-` &&
    raw.toUpperCase().replace(/[^VJEGP]/g, '') === letra
  ) {
    return '';
  }

  return `${letra}-${numeros}`;
}

/** Solo letras, tildes, ñ y espacios (nombre del titular). */
export function soloLetrasNombre(valor: string): string {
  return valor.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '');
}

export function esNumeroCuentaValido(valor: string): boolean {
  return new RegExp(`^\\d{${NUMERO_CUENTA_DIGITOS}}$`).test(valor.trim());
}

/** En Venezuela el N° de cuenta inicia con el código SUDEBAN del banco (4 dígitos). */
export function cuentaCoincideConBanco(numeroCuenta: string, bancoCode: string): boolean {
  const code = String(bancoCode ?? '').trim();
  const cuenta = numeroCuenta.trim();
  if (!/^\d{4}$/.test(code) || cuenta.length < 4) return false;
  return cuenta.startsWith(code);
}

/** Secuencia ascendente o descendente continua (ej. 123456…, 987654…). */
function esSecuenciaDigitosObvia(digits: string): boolean {
  if (digits.length < 6) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1) - 48;
    const curr = digits.charCodeAt(i) - 48;
    if (curr !== prev + 1) asc = false;
    if (curr !== prev - 1) desc = false;
  }
  return asc || desc;
}

/**
 * Heurística sobre los 16 dígitos tras el código del banco.
 * Rechaza ceros, dígito repetido y secuencias obvias; no verifica existencia real.
 */
export function esCuentaPlausible(numeroCuenta: string, bancoCode: string): boolean {
  const cola = colaCuentaSinPrefijo(numeroCuenta.trim(), bancoCode);
  if (cola.length < NUMERO_CUENTA_DIGITOS - 4) return true;
  if (/^0+$/.test(cola)) return false;
  if (/^(\d)\1+$/.test(cola)) return false;
  if (esSecuenciaDigitosObvia(cola)) return false;
  return true;
}

export function esCuentaBancariaValida(numeroCuenta: string, bancoCode: string): boolean {
  return (
    esNumeroCuentaValido(numeroCuenta) &&
    cuentaCoincideConBanco(numeroCuenta, bancoCode) &&
    esCuentaPlausible(numeroCuenta, bancoCode)
  );
}

/** Dígitos de la cuenta sin el prefijo SUDEBAN (máx. 16). */
export function colaCuentaSinPrefijo(numeroCuenta: string, bancoCode?: string): string {
  const digits = numeroCuenta.replace(/\D/g, '');
  const code = String(bancoCode ?? '').trim();
  if (/^\d{4}$/.test(code) && digits.startsWith(code)) {
    return digits.slice(4, NUMERO_CUENTA_DIGITOS);
  }
  return digits.length > 4 ? digits.slice(4, NUMERO_CUENTA_DIGITOS) : '';
}

/** Prefija el código del banco y conserva el resto de la cuenta (hasta 20 dígitos). */
export function aplicarPrefijoBanco(numeroCuenta: string, bancoCode: string): string {
  const code = String(bancoCode ?? '').trim();
  if (!/^\d{4}$/.test(code)) return '';
  return (code + colaCuentaSinPrefijo(numeroCuenta, code)).slice(0, NUMERO_CUENTA_DIGITOS);
}

/** Sanitiza la entrada del usuario manteniendo el prefijo del banco bloqueado. */
export function sanitizarCuentaConBanco(raw: string, bancoCode: string): string {
  const code = String(bancoCode ?? '').trim();
  if (!/^\d{4}$/.test(code)) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith(code)) {
    digits = digits.slice(4);
  } else if (digits.length === NUMERO_CUENTA_DIGITOS) {
    // Pegó una cuenta completa: se conserva el cuerpo y se fuerza el banco seleccionado.
    digits = digits.slice(4);
  }
  return (code + digits).slice(0, NUMERO_CUENTA_DIGITOS);
}

export function mensajeErrorCuentaBanco(numeroCuenta: string, bancoCode: string): string {
  const cuenta = numeroCuenta.trim();
  if (!cuenta) return '';
  const code = String(bancoCode ?? '').trim();
  if (code && cuenta.length >= 4 && !cuentaCoincideConBanco(cuenta, code)) {
    return `Los primeros 4 dígitos deben ser el código del banco seleccionado (${code}).`;
  }
  if (!esNumeroCuentaValido(cuenta)) {
    return `Faltan ${NUMERO_CUENTA_DIGITOS - cuenta.length} dígito(s).`;
  }
  if (!code) {
    return 'Selecciona el banco para validar el número de cuenta.';
  }
  if (!esCuentaPlausible(cuenta, code)) {
    return 'El número de cuenta no parece válido. Verifica que sea una cuenta real.';
  }
  return '';
}

/** Recibos cobrables: misma regla que RegistroDomiciliacion (prima Bs y $ > 0). */
export function filtrarRecibosCobrables<T extends { monto: number; montoExt: number }>(
  recibos: T[],
): T[] {
  return recibos.filter((r) => r.monto > 0 && r.montoExt > 0);
}

export const MSG_POLIZA_CANCELADA =
  'está cancelada. No se pueden consultar recibos ni registrar domiciliación.';

export const MSG_SIN_RECIBOS_COBRABLES =
  'No se puede domiciliar la póliza porque no tiene recibos pendientes cobrables (liquidados, anulados o sin prima en dólares).';

export type TipoCuentaDomiciliacion = 'AHORROS' | 'CORRIENTE';
export type EstadoDomiciliacion = 'PENDIENTE' | 'ACTIVA' | 'RECHAZADA' | 'CANCELADA';

export interface BancoSypago {
  code: string;
  name: string;
  active: boolean;
  isDebitOtp?: boolean;
}

export interface PolizaDomiciliacion {
  id: string;
  numeroPoliza: string;
  asegurado: string;
  ramo: string;
  estado: string;
  ifrecuencia?: string;
}

export interface ReciboPendiente {
  id: string;
  polizaId: string;
  numeroRecibo: string;
  monto: number;
  montoExt: number;
  qcuotas: number;
  fechaVencimiento: string;
  estado: string;
}

export interface DomiciliacionResult {
  id: string;
  polizaId: string;
  banco: string;
  tipoCuenta: TipoCuentaDomiciliacion;
  numeroCuenta: string;
  titularCuenta: string;
  cedulaTitular: string;
  correo?: string;
  estado: EstadoDomiciliacion;
  sypagoAfiliacionId: string | null;
  sypagoMensaje: string | null;
}

export interface RegistrarDomiciliacionInput {
  numeroPoliza: string;
  polizaId: string;
  banco: string;
  tipoCuenta: TipoCuentaDomiciliacion;
  numeroCuenta: string;
  titularCuenta: string;
  cedulaTitular: string;
  /** Obligatorio en el servicio Nest (notificaciones de cobro/rechazo). */
  correo: string;
  aceptaAutorizacion: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esCorreoDomiciliacionValido(valor: string): boolean {
  return EMAIL_RE.test(valor.trim());
}

export class DomiciliacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomiciliacionError';
  }
}

function messageFromAxios(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ message?: string; error?: string }>;
  const data = ax.response?.data;
  return data?.message || data?.error || ax.message || fallback;
}

export async function getSypagoBanks(soloActivos = true): Promise<BancoSypago[]> {
  try {
    const { data } = await api.get<BancoSypago[]>(
      `/sypago/banks?solo_activos=${soloActivos ? 'true' : 'false'}`,
    );
    return Array.isArray(data) ? data : [];
  } catch (err) {
    throw new DomiciliacionError(messageFromAxios(err, 'Error al consultar los bancos SyPago.'));
  }
}

export async function buscarPolizaDomiciliacion(numeroPoliza: string): Promise<PolizaDomiciliacion> {
  try {
    const { data } = await api.get<PolizaDomiciliacion[]>(
      `/polizas?numeroPoliza=${encodeURIComponent(numeroPoliza)}`,
    );
    const resultados = Array.isArray(data) ? data : [];
    const exactas = resultados.filter(
      (p) => p.numeroPoliza.toLowerCase() === numeroPoliza.trim().toLowerCase(),
    );
    if (exactas.length === 0) {
      throw new DomiciliacionError(`No se encontró la póliza ${numeroPoliza}.`);
    }
    const encontrada = exactas.find((p) => p.estado === 'ACTIVA');
    if (!encontrada) {
      throw new DomiciliacionError(
        `La póliza ${numeroPoliza} ${MSG_POLIZA_CANCELADA}`,
      );
    }
    return encontrada;
  } catch (err) {
    if (err instanceof DomiciliacionError) throw err;
    throw new DomiciliacionError(messageFromAxios(err, 'Error al consultar la póliza.'));
  }
}

export async function getRecibosPendientes(polizaId: string): Promise<ReciboPendiente[]> {
  try {
    const { data } = await api.get<ReciboPendiente[]>(`/polizas/${polizaId}/recibos-pendientes`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    throw new DomiciliacionError(messageFromAxios(err, 'Error al consultar los recibos pendientes.'));
  }
}

export async function registrarDomiciliacion(
  input: RegistrarDomiciliacionInput,
): Promise<DomiciliacionResult> {
  if (!input.aceptaAutorizacion) {
    throw new DomiciliacionError('El cliente debe aceptar la autorización de domiciliación.');
  }
  try {
    const { data } = await api.post<DomiciliacionResult>('/domiciliaciones', input);
    return data;
  } catch (err) {
    throw new DomiciliacionError(
      messageFromAxios(err, 'Error al registrar la domiciliación en el backend.'),
    );
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extrae número/id de póliza ya existente en checkout SSO.
 * Solo usa campos explícitos de póliza — no `checkout.referenceId`,
 * que suele ser un id de cobro y no un número de póliza.
 */
export function getCheckoutPolicyRef(
  checkout: CheckoutData | null | undefined,
  payload: Record<string, unknown> | null | undefined,
): { numeroPoliza?: string; polizaId?: string } {
  const p = payload ?? {};
  const nested =
    p.poliza && typeof p.poliza === 'object'
      ? (p.poliza as Record<string, unknown>)
      : {};
  const checkoutObj =
    checkout && typeof checkout === 'object'
      ? (checkout as unknown as Record<string, unknown>)
      : {};

  const numeroPoliza =
    asNonEmptyString(p.numeroPoliza) ||
    asNonEmptyString(p.cnpoliza) ||
    asNonEmptyString(p.policyNumber) ||
    asNonEmptyString(nested.numeroPoliza) ||
    asNonEmptyString(nested.cnpoliza) ||
    asNonEmptyString(checkoutObj.numeroPoliza) ||
    asNonEmptyString(checkoutObj.cnpoliza);

  const polizaId =
    asNonEmptyString(p.polizaId) ||
    asNonEmptyString(p.cpoliza) ||
    asNonEmptyString(p.internalPolicyId) ||
    asNonEmptyString(nested.polizaId) ||
    asNonEmptyString(nested.cpoliza) ||
    asNonEmptyString(nested.id);

  return { numeroPoliza, polizaId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Afilia la póliza recién emitida (o una ya existente) en el backend Nest.
 * Reintenta la consulta de póliza porque Sis2000 puede tardar en indexarla.
 */
export async function registrarDomiciliacionForPolicy(params: {
  numeroPoliza: string;
  polizaId?: string | null;
  capture: PaymentCapture;
}): Promise<DomiciliacionResult> {
  const { numeroPoliza, capture } = params;
  if (!capture.bankCode || !capture.numeroCuenta || !capture.cci_rif || !capture.titularCuenta) {
    throw new DomiciliacionError('Faltan datos bancarios para registrar la domiciliación.');
  }
  if (!esCuentaBancariaValida(capture.numeroCuenta, capture.bankCode)) {
    throw new DomiciliacionError(
      mensajeErrorCuentaBanco(capture.numeroCuenta, capture.bankCode)
        || `El número de cuenta debe tener ${NUMERO_CUENTA_DIGITOS} dígitos y comenzar con el código del banco.`,
    );
  }
  if (!capture.correo || !esCorreoDomiciliacionValido(capture.correo)) {
    throw new DomiciliacionError(
      'Debe indicar un correo electrónico válido para las notificaciones de cobro.',
    );
  }

  let polizaId = '';
  let lastError = 'No se encontró la póliza para domiciliar.';
  for (let i = 0; i < 4; i++) {
    try {
      const poliza = await buscarPolizaDomiciliacion(numeroPoliza);
      polizaId = String(poliza.id);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
      if (i < 3) await sleep(1500 * (i + 1));
    }
  }
  if (!polizaId) {
    polizaId = params.polizaId?.trim() || '';
  }
  if (!polizaId) throw new DomiciliacionError(lastError);

  let cobrables: ReciboPendiente[] = [];
  for (let i = 0; i < 4; i++) {
    try {
      cobrables = filtrarRecibosCobrables(await getRecibosPendientes(polizaId));
      if (cobrables.length > 0) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
    if (i < 3) await sleep(1500 * (i + 1));
  }
  if (cobrables.length === 0) {
    throw new DomiciliacionError(MSG_SIN_RECIBOS_COBRABLES);
  }

  return registrarDomiciliacion({
    numeroPoliza,
    polizaId,
    banco: capture.bankCode,
    tipoCuenta: capture.tipoCuenta === 'CORRIENTE' ? 'CORRIENTE' : 'AHORROS',
    numeroCuenta: capture.numeroCuenta.trim(),
    titularCuenta: capture.titularCuenta.trim(),
    cedulaTitular: capture.cci_rif.trim(),
    correo: capture.correo.trim(),
    aceptaAutorizacion: true,
  });
}
