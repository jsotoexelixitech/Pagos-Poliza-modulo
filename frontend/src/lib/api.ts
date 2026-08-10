import axios, { AxiosError } from 'axios';
import type { CheckoutData, DocType, OcrResult, DocumentFile } from '../types';
import { moduleApiBase } from './app-base';
import { attachNexusTokenAxios } from './nexus-token-client';

const api = axios.create({ baseURL: moduleApiBase() });

const NEXUS_TOKEN_KEY = 'nexus_access_token_pagos';
attachNexusTokenAxios(api, NEXUS_TOKEN_KEY);

export interface UploadResponse {
  success: boolean;
  message: string;
  docType: DocType;
  file: DocumentFile;
  ocr: OcrResult;
  ocrProvider?: string;
  /**
   * `true` cuando el archivo se guardo correctamente pero el OCR no pudo
   * extraer datos (cuota agotada, imagen ilegible, etc.). El cliente debe
   * pedir al usuario que llene el formulario manualmente. NUNCA pre-rellenar
   * con valores por defecto del servidor.
   */
  ocrFailed?: boolean;
  ocrError?: string;
}

/**
 * Error que se lanza cuando el documento subido no coincide
 * con el tipo esperado por el slot (validacion del header por OCR).
 */
export class DocTypeMismatchError extends Error {
  expected: DocType;
  detected: string;
  expectedLabel: string;
  detectedLabel: string;

  constructor(payload: {
    message: string;
    expected: DocType;
    detected: string;
    expectedLabel: string;
    detectedLabel: string;
  }) {
    super(payload.message);
    this.name = 'DocTypeMismatchError';
    this.expected = payload.expected;
    this.detected = payload.detected;
    this.expectedLabel = payload.expectedLabel;
    this.detectedLabel = payload.detectedLabel;
  }
}

/**
 * Uploads a document to the server with upload progress reporting.
 */
export async function uploadDocument(
  file: File,
  docType: DocType,
  onProgress: (pct: number) => void
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('docType', docType);

  try {
    const response = await api.post<UploadResponse>('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });

    return response.data;
  } catch (err) {
    const axErr = err as AxiosError<{
      code?: string;
      message?: string;
      expected?: DocType;
      detected?: string;
      expectedLabel?: string;
      detectedLabel?: string;
    }>;

    const data = axErr.response?.data;
    if (axErr.response?.status === 422 && data?.code === 'DOC_TYPE_MISMATCH') {
      throw new DocTypeMismatchError({
        message: data.message ?? 'El documento no coincide con el tipo solicitado.',
        expected: (data.expected ?? docType) as DocType,
        detected: data.detected ?? 'desconocido',
        expectedLabel: data.expectedLabel ?? String(docType),
        detectedLabel: data.detectedLabel ?? 'documento no reconocido',
      });
    }

    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Polizas — integracion La Mundial (cotizar + emitir)
// ──────────────────────────────────────────────────────────────────────

/**
 * Payload del endpoint /api/policies/emit. El backend recibe el `state`
 * COMPLETO del wizard (tomador, vehicle, asegurado, ...) y orquesta
 * cotizacion + emision contra La Mundial. Asi NO hay que duplicar
 * mapeos en el cliente.
 */
export interface EmitPolicyPayload {
  state: unknown;
  plan?: 'RCVBAS' | 'RUSPAT';
  frecuencia?: 'A' | 'S' | 'M' | 'T' | 'C';
}

export interface PolicyQuote {
  mprima: number;
  mprimaext: number;
  ptasa: number;
}

export interface EmittedPolicy {
  /** Alias compat con front antiguo. Igual a `cnpoliza`. */
  number: string;
  /** Numero oficial de poliza La Mundial (ej. "18-1-0000048127"). */
  cnpoliza: string;
  /** Numero de recibo La Mundial (ej. "18-100143232"). */
  cnrecibo: string;
  /** URL al PDF emitido por La Mundial. Vacia en modo legacy/mock. */
  urlpoliza: string;
  /** URL al anexo de conductor habitual (RCV). */
  url_conductor_habitual?: string;
  /** URL PDF Club Arys (cobertura ccober=15). */
  url_club_arys?: string;
  /** URL comprobante ingreso de caja Sis2000. */
  url_ingreso_caja?: string;
  /** Numero de cuota (1 = primera cuota / pago anual). */
  ncuota?: number;
  /** Identificador interno de control (no es el numero de poliza). */
  internalPolicyId: string;
  /** ISO timestamp de emision. */
  emittedAt: string;
  /** Cotizacion usada para emitir (mprima en VES, mprimaext en USD, ptasa Bs/USD). */
  quote?: PolicyQuote;
  /** Metadata adicional (etiquetas de catalogo, fallback flags, etc.). */
  metadata?: Record<string, unknown>;
}

export interface EmitPolicyResponse {
  success: boolean;
  message?: string;
  policy: EmittedPolicy;
}

/**
 * Error tipado para fallos conocidos al emitir poliza.
 * `code` viene del backend y permite UX especifica (placa duplicada,
 * apikey invalida, SP desactualizado, etc.).
 */
export class PolicyEmitError extends Error {
  code: string;
  httpStatus?: number;
  details?: string[];
  internalPolicyId?: string;
  stage?: string;

  constructor(payload: {
    code: string;
    message: string;
    httpStatus?: number;
    details?: string[];
    internalPolicyId?: string;
    stage?: string;
  }) {
    super(payload.message);
    this.name = 'PolicyEmitError';
    this.code = payload.code;
    this.httpStatus = payload.httpStatus;
    this.details = payload.details;
    this.internalPolicyId = payload.internalPolicyId;
    this.stage = payload.stage;
  }
}

export async function emitPolicy(payload: EmitPolicyPayload): Promise<EmitPolicyResponse> {
  try {
    const response = await api.post<EmitPolicyResponse>('/policies/emit', payload);
    return response.data;
  } catch (err) {
    const axErr = err as AxiosError<{
      success?: boolean;
      code?: string;
      message?: string;
      details?: string[];
      internalPolicyId?: string;
      stage?: string;
    }>;
    const data = axErr.response?.data;
    if (data && (data.code || data.message)) {
      throw new PolicyEmitError({
        code: data.code ?? 'POLICY_ERROR',
        message: data.message ?? 'Error emitiendo la poliza.',
        httpStatus: axErr.response?.status,
        details: data.details,
        internalPolicyId: data.internalPolicyId,
        stage: data.stage,
      });
    }
    throw err;
  }
}

/**
 * Emite una póliza del producto Funerario (personas, ramo 9). El backend de
 * emisión cotiza (spCalculoPer) y emite (vista eePoliza_Personas_General) en un
 * solo llamado a partir del `state` completo del wizard.
 */
export async function emitFuneral(payload: EmitPolicyPayload): Promise<EmitPolicyResponse> {
  try {
    const response = await api.post<EmitPolicyResponse>('/personas/emision', payload);
    return response.data;
  } catch (err) {
    const axErr = err as AxiosError<{
      success?: boolean;
      code?: string;
      message?: string;
      details?: string[];
      internalPolicyId?: string;
      stage?: string;
    }>;
    const data = axErr.response?.data;
    if (data && (data.code || data.message)) {
      throw new PolicyEmitError({
        code: data.code ?? 'PERSONAS_ERROR',
        message: data.message ?? 'Error emitiendo la póliza funeraria.',
        httpStatus: axErr.response?.status,
        details: data.details,
        internalPolicyId: data.internalPolicyId,
        stage: data.stage,
      });
    }
    throw err;
  }
}

export interface QuotePolicyPayload {
  state: unknown;
  plan?: string;
}

export interface QuotePolicyResponse {
  success: boolean;
  mprima: number;
  mprimaext: number;
  ptasa: number;
  metadata?: Record<string, unknown>;
}

export async function quotePolicy(payload: QuotePolicyPayload): Promise<QuotePolicyResponse> {
  const response = await api.post<QuotePolicyResponse>('/policies/quote', payload);
  return response.data;
}

export async function emitExelixiPolicy(payload: { state: unknown }): Promise<EmitPolicyResponse> {
  try {
    const response = await api.post<EmitPolicyResponse>('/exelixi/emit', payload);
    return response.data;
  } catch (err) {
    const axErr = err as AxiosError<{
      success?: boolean;
      code?: string;
      message?: string;
    }>;
    const data = axErr.response?.data;
    if (data && (data.code || data.message)) {
      throw new PolicyEmitError({
        code: data.code ?? 'EXELIXI_EMIT_ERROR',
        message: data.message ?? 'Error emitiendo la póliza Exélixi.',
        httpStatus: axErr.response?.status,
      });
    }
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  Meritop — Verificación de Pago Móvil
// ──────────────────────────────────────────────────────────────────────────

export interface VerifyMobilePaymentPayload {
  /** Teléfono de origen: 04XXXXXXXXX o 584XXXXXXXXX */
  sourcePhoneNumber: string;
  /** Código de banco de 4 dígitos (ej. "0174" para Banco Activo) */
  bankCode: string;
  /** Monto en Bs (decimal) */
  amount: number;
  /** Fecha del pago en formato YYYY-MM-DD */
  paidOn: string;
  /** RIF o cédula del cliente (ej. "V-19908817") — opcional */
  cci_rif?: string;
}

export interface VerifyMobilePaymentResponse {
  success: boolean;
  isVerified: boolean;
  reference: string | null;
  verifiedAmount: number | null;
  verifiedOn: string | null;
  message: string;
  code: string;
}

export class MobilePaymentVerifyError extends Error {
  code: string;
  baCode?: string | null;
  baMessage?: string | null;
  httpStatus?: number;

  constructor(payload: {
    message: string;
    code: string;
    baCode?: string | null;
    baMessage?: string | null;
    httpStatus?: number;
  }) {
    super(payload.message);
    this.name = 'MobilePaymentVerifyError';
    this.code = payload.code;
    this.baCode = payload.baCode;
    this.baMessage = payload.baMessage;
    this.httpStatus = payload.httpStatus;
  }
}

export async function verifyMobilePayment(
  payload: VerifyMobilePaymentPayload
): Promise<VerifyMobilePaymentResponse> {
  try {
    const res = await api.post<VerifyMobilePaymentResponse>(
      '/payments/verify-mobile',
      payload
    );
    return res.data;
  } catch (err) {
    const axErr = err as AxiosError<{
      code?: string;
      message?: string;
      baCode?: string | null;
      baMessage?: string | null;
    }>;
    const data   = axErr.response?.data;
    const status = axErr.response?.status;
    throw new MobilePaymentVerifyError({
      message   : data?.message ?? axErr.message ?? 'Error verificando el pago.',
      code      : data?.code    ?? 'MERITOP_ERROR',
      baCode    : data?.baCode,
      baMessage : data?.baMessage,
      httpStatus: status,
    });
  }
}

export interface CheckoutNotifyRequest {
  status: 'ok' | 'error';
  paymentVerified: boolean;
  code?: string | null;
  message?: string | null;
  payment?: Record<string, unknown> | null;
  checkout?: CheckoutData | null;
  payload?: Record<string, unknown> | null;
}

export interface CheckoutNotifyResponse {
  success: boolean;
  notified?: boolean;
  clientStatus?: number;
  code?: string;
  message?: string;
}

export async function notifyCheckoutStatus(
  body: CheckoutNotifyRequest,
): Promise<CheckoutNotifyResponse> {
  const res = await api.post<CheckoutNotifyResponse>('/checkout/notify', body);
  return res.data;
}

// ── SyPago — Débito OTP ───────────────────────────────────────────────────

export interface SypagoOtpRequestPayload {
  documentType   : string;
  documentNumber : string;
  debtorBankCode : string;
  debtorPhone    : string;
  amount         : number;
}

export interface SypagoOtpConfirmPayload {
  documentType   : string;
  documentNumber : string;
  debtorBankCode : string;
  debtorPhone    : string;
  debtorName     : string;
  amount         : number;
  otp            : string;
  concept?       : string;
}

export interface SypagoStatusInfo {
  code  : string;
  label : string;
  state : 'pending' | 'approved' | 'rejected';
}

export interface SypagoOtpConfirmResponse {
  success          : boolean;
  transaction_id   : string;
  operation_secret?  : string;
  status?          : string;
  statusInfo?      : SypagoStatusInfo;
  ref_ibp?         : string | null;
  mock?            : boolean;
}

export interface SypagoTransactionStatus {
  success        : boolean;
  transaction_id : string;
  status         : string;
  statusInfo?    : SypagoStatusInfo;
  mock?          : boolean;
  [key: string]  : unknown;
}

const SYPAGO_FINAL_STATUSES = new Set(['ACCP', 'RJCT', 'CANC']);

function _sypagoStatusCode(status?: string): string {
  return String(status || '').toUpperCase();
}

export function isSypagoApproved(status?: string, statusInfo?: SypagoStatusInfo): boolean {
  return statusInfo?.state === 'approved' || _sypagoStatusCode(status) === 'ACCP';
}

export function isSypagoRejected(status?: string, statusInfo?: SypagoStatusInfo): boolean {
  return statusInfo?.state === 'rejected' || ['RJCT', 'CANC'].includes(_sypagoStatusCode(status));
}

export function isSypagoPending(status?: string, statusInfo?: SypagoStatusInfo): boolean {
  if (isSypagoApproved(status, statusInfo) || isSypagoRejected(status, statusInfo)) return false;
  return statusInfo?.state === 'pending' || ['PEND', 'PROC'].includes(_sypagoStatusCode(status));
}

export class SypagoError extends Error {
  code       : string;
  sypagoCode?: string | null;
  httpStatus?: number;

  constructor(payload: { message: string; code: string; sypagoCode?: string | null; httpStatus?: number }) {
    super(payload.message);
    this.name       = 'SypagoError';
    this.code       = payload.code;
    this.sypagoCode = payload.sypagoCode;
    this.httpStatus = payload.httpStatus;
  }
}

function _throwSypago(err: unknown): never {
  const axErr = err as AxiosError<{ code?: string; message?: string; sypagoCode?: string | null }>;
  const data   = axErr.response?.data;
  const status = axErr.response?.status;
  throw new SypagoError({
    message   : data?.message ?? (axErr as Error).message ?? 'Error con SyPago.',
    code      : data?.code    ?? 'SYPAGO_ERROR',
    sypagoCode: data?.sypagoCode ?? null,
    httpStatus: status,
  });
}

/** Paso 1: solicita que el banco del cliente envíe una OTP */
export async function sypagoRequestOtp(
  payload: SypagoOtpRequestPayload
): Promise<{ success: boolean; message: string; mock?: boolean }> {
  try {
    const res = await api.post('/payments/otp/request', payload);
    return res.data;
  } catch (err) {
    _throwSypago(err);
  }
}

/** Paso 2: envía OTP + datos y ejecuta el débito */
export async function sypagoConfirmOtp(
  payload: SypagoOtpConfirmPayload
): Promise<SypagoOtpConfirmResponse> {
  try {
    const res = await api.post<SypagoOtpConfirmResponse>('/payments/otp/confirm', payload);
    return res.data;
  } catch (err) {
    _throwSypago(err);
  }
}

/** Consulta el estado de una transacción por ID */
export async function sypagoGetStatus(transactionId: string): Promise<SypagoTransactionStatus> {
  try {
    const res = await api.get<SypagoTransactionStatus>(`/payments/otp/status/${transactionId}`);
    return res.data;
  } catch (err) {
    _throwSypago(err);
  }
}

/** Reintenta la consulta de estado hasta ACCP/RJCT/CANC o agotar intentos. */
export async function pollSypagoStatus(
  transactionId: string,
  opts?: { maxAttempts?: number; intervalMs?: number },
): Promise<SypagoTransactionStatus> {
  const maxAttempts = opts?.maxAttempts ?? 8;
  const intervalMs  = opts?.intervalMs ?? 3000;
  let last = await sypagoGetStatus(transactionId);

  for (let i = 1; i < maxAttempts && !SYPAGO_FINAL_STATUSES.has(_sypagoStatusCode(last.status)); i++) {
    await new Promise((r) => setTimeout(r, intervalMs * i));
    last = await sypagoGetStatus(transactionId);
  }

  return last;
}

// ── Catálogo INMA ──────────────────────────────────────────────────────────

export interface InmaMarca   { cmarca: string; xmarca: string; }
export interface InmaModelo  { cmodelo: string; xmodelo: string; }
export interface InmaVersion { cversion: string; xversion: string; }
export interface CategoriaUso { ccategoria_uso: number; xcategoria_uso: string; }

export interface ResolverResult {
  success: boolean;
  fallback?: boolean;
  cmarca?: string;
  xmarca?: string;
  cmodelo?: string;
  xmodelo?: string;
  versiones?: InmaVersion[];
  message?: string;
}

export const catalogoApi = {
  anios: () =>
    api.get<{ success: boolean; min: number; max: number }>('/catalogo/anios'),
  marcas: (fano: number) =>
    api.get<{ success: boolean; data: InmaMarca[] }>(`/catalogo/marcas?fano=${fano}`),
  modelos: (fano: number, cmarca: string) =>
    api.get<{ success: boolean; data: InmaModelo[] }>(`/catalogo/modelos?fano=${fano}&cmarca=${cmarca}`),
  versiones: (fano: number, cmarca: string, cmodelo: string) =>
    api.get<{ success: boolean; data: InmaVersion[] }>(`/catalogo/versiones?fano=${fano}&cmarca=${cmarca}&cmodelo=${cmodelo}`),
  /** Categorías de uso aplicables a la versión (depende de la versión seleccionada). */
  categoriasUso: (fano: number, cmarca: string, cmodelo: string, cversion: string) =>
    api.get<{ success: boolean; data: CategoriaUso[] }>(
      `/catalogo/categorias-uso?fano=${fano}&cmarca=${cmarca}&cmodelo=${cmodelo}&cversion=${cversion}`,
    ),
  /** Resuelve texto libre (de OCR) → cmarca + cmodelo + versiones en una sola llamada */
  resolver: (fano: number, marca: string, modelo: string) =>
    api.get<ResolverResult>(`/catalogo/resolver?fano=${fano}&marca=${encodeURIComponent(marca)}&modelo=${encodeURIComponent(modelo)}`),
};

// ──────────────────────────────────────────────────────────────────────
//  Catálogos de La Mundial — Estados, Ciudades y Listas (valrep)
// ──────────────────────────────────────────────────────────────────────

export interface CatalogItem {
  code: number | string;
  label: string;
}

/** Caché en módulo — persiste durante la sesión, evita re-fetches */
const _valrepCache: Record<string, CatalogItem[]> = {};

async function _fetchValrep(path: string): Promise<CatalogItem[]> {
  if (_valrepCache[path]) return _valrepCache[path];
  const { data } = await api.get<{ ok: boolean; items: CatalogItem[] }>(path);
  const items = data?.items ?? [];
  _valrepCache[path] = items;
  return items;
}

/** Lista de estados venezolanos con código La Mundial */
export function getEstados(): Promise<CatalogItem[]> {
  return _fetchValrep('/valrep/state');
}

/**
 * Ciudades del estado indicado (cestado = código numérico La Mundial).
 * Si no se pasa cestado, devuelve todas las ciudades del país.
 * Cada estado se cachea por separado.
 */
export function getCiudades(cestado?: number | null): Promise<CatalogItem[]> {
  const path = cestado ? `/valrep/city?cestado=${cestado}` : '/valrep/city';
  return _fetchValrep(path);
}

/**
 * Lista genérica de La Mundial.
 * @param domain  SEXO | EDOCIVIL | PARENTESCOS | FRECUENCIAS | MATIPCANAL
 */
export function getValrepList(domain: string): Promise<CatalogItem[]> {
  return _fetchValrep(`/valrep/list/${domain.toUpperCase()}`);
}

export interface ValidateVehicleOptions {
  plan?: string;
  serialMotor?: string;
}

/**
 * Valida en Sis2000 (vía nest-api) si el vehículo ya posee una póliza vigente.
 */
export async function validateVehicle(
  placa: string,
  serial: string,
  options?: ValidateVehicleOptions,
): Promise<{ success: boolean; message: string; code?: string }> {
  try {
    const res = await api.post('/valrep/validate-vehicle', {
      placa,
      serial,
      serialMotor: options?.serialMotor,
      plan: options?.plan,
    });
    return res.data;
  } catch (err) {
    const axErr = err as AxiosError<{ success: boolean; message: string; code?: string }>;
    if (axErr.response?.data) {
      return axErr.response.data;
    }
    throw err;
  }
}
