/**
 * Protocolo de comunicacion entre modulos Exelixi.
 *
 * Define los TIPOS DE MENSAJE que viajan por el event-bus.
 * Cada modulo publica eventos cuando termina (`*:complete`),
 * cuando progresa (`*:progress`) o cuando falla (`*:error`).
 */

// Documentos del modulo OCR
export type DocumentType = 'cedula' | 'licencia' | 'certificado' | 'rif';

export interface OcrDocumentResult {
  docType: DocumentType;
  fileUrl: string;
  fields: Record<string, string | null>;
  ocrFailed?: boolean;
  ocrProvider?: string;
  ocrModel?: string;
}

// Tomador (modulo Formulario)
export interface TomadorData {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc: 'V' | 'E' | 'P';
  fechaNacimiento: string;
  email: string;
  telefono: string;
  direccion: string;
  estadoCode?: string;
  estadoLabel?: string;
  ciudadCode?: string;
  ciudadLabel?: string;
  sexo?: string;
  estadoCivil?: string;
}

// Vehiculo (modulo Formulario)
export interface VehicleData {
  placa: string;
  tipoPlaca: 'nacional' | 'extranjera';
  serial: string;
  marca: string;
  modelo: string;
  anio: string;
  color: string;
  cmarca?: string;
  cmodelo?: string;
  cversion?: string;
  ccategoriaUso?: string;
}

// Pagos
export type PaymentMethod = 'mobile' | 'otp';

export interface PaymentResult {
  method: PaymentMethod;
  reference?: string;
  amount: number;
  verifiedAt?: string;
  bankCode?: string;
  bankLabel?: string;
}

// Emision
export interface EmissionResult {
  cnpoliza: string;
  cnrecibo?: string;
  urlpoliza?: string;
  emittedAt: string;
  plan: string;
  prima: number;
  primaUsd?: number;
}

// Mensajes del bus
export type ModuleSource = 'ocr' | 'formulario' | 'pagos' | 'emision' | 'host';

interface BaseMessage {
  source: ModuleSource;
  timestamp?: string;
  correlationId?: string;
}

export type ModuleMessage =
  | (BaseMessage & { type: 'ocr:start';    payload: { docType: DocumentType } })
  | (BaseMessage & { type: 'ocr:progress'; payload: { docType: DocumentType; pct: number } })
  | (BaseMessage & { type: 'ocr:complete'; payload: { documents: OcrDocumentResult[] } })
  | (BaseMessage & { type: 'ocr:error';    payload: { docType: DocumentType; message: string } })
  | (BaseMessage & { type: 'formulario:tomador-changed'; payload: Partial<TomadorData> })
  | (BaseMessage & { type: 'formulario:vehicle-changed'; payload: Partial<VehicleData> })
  | (BaseMessage & { type: 'formulario:complete';        payload: { tomador: TomadorData; vehicle: VehicleData } })
  | (BaseMessage & { type: 'formulario:error';           payload: { message: string } })
  | (BaseMessage & { type: 'pagos:method-selected'; payload: { method: PaymentMethod } })
  | (BaseMessage & { type: 'pagos:complete';        payload: PaymentResult })
  | (BaseMessage & { type: 'pagos:error';           payload: { code: string; message: string } })
  | (BaseMessage & { type: 'emision:quote-ready';    payload: { mprima: number; mprimaext?: number; ptasa?: number } })
  | (BaseMessage & { type: 'emision:policy-emitted'; payload: EmissionResult })
  | (BaseMessage & { type: 'emision:error';          payload: { code: string; message: string } })
  | (BaseMessage & { type: 'host:prefill';        payload: Partial<{ tomador: TomadorData; vehicle: VehicleData; documents: OcrDocumentResult[] }> })
  | (BaseMessage & { type: 'host:reset';          payload: { module?: ModuleSource | 'all' } });

export type ModuleMessageType = ModuleMessage['type'];
