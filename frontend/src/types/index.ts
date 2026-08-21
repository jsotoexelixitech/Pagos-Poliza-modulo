export type DocType = 'cedula' | 'licencia' | 'certificado' | 'rif' | 'pasaporte';

export type { DiligenciaState, TipoDiligencia } from '../lib/diligencia';

/** Producto de seguro que se está suscribiendo en el flujo. */
export type ProductId = 'rcv' | 'funerario';

export type DocStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface DocumentFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

export interface OcrResult {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  fechaNacimiento?: string;
  sexo?: string;
  estadoCivil?: string;
  numeroLicencia?: string;
  categoria?: string;
  vencimiento?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  año?: string;
  serial?: string;
  color?: string;
  rif?: string;
  razonSocial?: string | null;
}

export interface DocumentState {
  status: DocStatus;
  progress: number;
  file?: DocumentFile;
  ocr?: OcrResult;
  error?: string;
}

export type TomadorData = {
  tipoDoc: string;
  identificacion: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  email2: string;
  fechaNac: string;
  sexo: string;
  estadoCivil: string;
  estado: string;
  ciudad: string;
  direccion: string;
  /** Declara ser Persona Políticamente Expuesta (requerido por La Mundial). */
  personaPoliticamenteExpuesta: boolean;
  /** Código numérico La Mundial del estado (cestado). Se obtiene del selector de catálogo. */
  cestado?: number;
  /** Código numérico La Mundial de la ciudad (cciudad). Se obtiene del selector de catálogo. */
  cciudad?: number;
  cprofesion?: number | string;
  cactividad?: number | string;
  xprofesion?: string;
  xactividad?: string;
  itipoDiligencia?: 'S' | 'C';
};

export type PersonData = {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc?: string;
  fechaNac?: string;
  parentesco?: string;
  licencia?: string;
  relacion?: string;
  telefono?: string;
  email?: string;
  sexo?: string;
  estadoCivil?: string;
  estado?: string;
  cestado?: number;
  ciudad?: string;
  cciudad?: number;
  direccion?: string;
};

export interface Plan {
  /** Código del plan en Sis2000 (ej. "RCVBAS", "Auto"). Se envía al backend en quote/emit. */
  cplan?: string;
  name: string;
  price: string;
  priceNum: number;
  tag: string;
  desc: string;
  benefits: string[];
  /** Suma asegurada (USD) — máximo cubierto por la póliza */
  sumaAsegurada: number;
  /** Sufijo opcional para la suma asegurada (ej. "/unidad") */
  sumaAseguradaUnit?: string;
}

export type PaymentMethod = 'card' | 'transfer' | 'mobile' | 'otp';

/** Datos del pago verificado para activar recibo en Sis2000 al emitir. */
export interface PaymentCapture {
  reference?: string;
  transactionId?: string;
  amount?: number;
  paidOn?: string;
  /** Código banco origen (cbanco_ref) usado en la verificación móvil. */
  bankCode?: string;
  /** Teléfono origen del pago móvil (xtelefono). */
  sourcePhone?: string;
  /** Cédula/RIF usada en la verificación móvil. */
  cci_rif?: string;
  /** Teléfono destino La Mundial. */
  telefonoDest?: string;
  /** Ref. banco destino (ej. 0171). */
  cbanco_dest_ref?: string;
  cbanco?: number;
  cbanco_destino?: number;
}

/** Snapshot de pago pasado al auto-emit (evita race con re-render de React). */
export interface PaymentEmitContext {
  paymentVerified: boolean;
  paymentCapture: PaymentCapture | null;
}

/** Línea de detalle en checkout genérico (cualquier concepto a cobrar). */
export interface CheckoutLine {
  label: string;
  amountVes: number;
  amountUsd?: number;
}

/** Datos de checkout inyectados por sesión bridge o metadata SSO. */
export interface CheckoutData {
  referenceId?: string;
  title: string;
  subtitle?: string;
  lines?: CheckoutLine[];
  totalVes: number;
  totalUsd?: number;
  exchangeRate?: number;
}

export type CheckoutOnSuccessMode = 'none' | 'redirect' | 'webhook' | 'emit';

export interface CheckoutRules {
  requirePayment?: boolean;
  methods?: PaymentMethod[];
  /** Funerario aprobado: no editar datos del wizard */
  lockFields?: boolean;
  /** Ocultar stepper / navegación a pasos anteriores */
  hideNavigation?: boolean;
  onSuccess?: {
    mode?: CheckoutOnSuccessMode;
    redirectUrl?: string;
    webhookUrl?: string;
    /** Salir del iframe al redirigir (ej. `_top`). */
    target?: string;
  };
}

export interface CheckoutPayer {
  documentType?: string;
  documentNumber?: string;
  name?: string;
  phone?: string;
}

/**
 * Persona (asegurado o beneficiario) del producto Funerario.
 * Mapea a los campos de la API de Personas (ramo 9).
 */
export interface FuneralPerson {
  tipoDoc: string;
  identificacion: string;
  nombre: string;
  apellido: string;
  fechaNac: string;
  sexo: string;
  /** Código de parentesco La Mundial (1=Titular, 2=Cónyuge, 3=Hijo(a)…). */
  parentesco: string;
}

/** Datos RCV: frecuencia de pago del plan automóvil. */
export interface RcvPlanData {
  frecuencia: string;
  ndias?: number | null;
}

/** Datos del producto Funerario (personas). Solo se usa si product = 'funerario'. */
export interface FuneralData {
  /** Personas aseguradas. El primer elemento es el titular (parentesco=1). */
  asegurados: FuneralPerson[];
  /** Beneficiarios de la póliza (opcional según el plan). */
  beneficiarios: FuneralPerson[];
  /** Frecuencia de pago (A, S, C, T, M). */
  frecuencia: string;
  /** Declara haber sido diagnosticado con alguna enfermedad. */
  diagnosticoEnfermedad: boolean;
  /** Descripción de la enfermedad (si diagnosticoEnfermedad = true). */
  descripcionEnfermedad: string;
  /** Acepta términos y condiciones (obligatorio para emitir). */
  aceptaTerminos: boolean;
  healthAnswers?: Record<string, unknown>;
  healthQuestionnaireDone?: boolean;
}

export interface VehicleData {
  placa: string;
  /** Tipo de placa: nacional (formato venezolano AAA000A/AAA000) o extranjera. */
  tipoPlaca: 'nacional' | 'extranjera';
  marca: string;   // nombre descriptivo (ej. "TOYOTA") — para display
  modelo: string;  // nombre descriptivo (ej. "COROLLA") — para display
  año: string;
  color: string;
  serial: string;
  uso: string;
  /** Código INMA de marca (ej. "074") — set al elegir en selector de catálogo */
  cmarca?: string;
  /** Código INMA de modelo (ej. "005") — set al elegir en selector de catálogo */
  cmodelo?: string;
  /** Código INMA de versión (ej. "05") — set al elegir en selector de catálogo */
  cversion?: string;
  /** Uso tarifario de la versión INMA (ccategotr) — se matchea con ccategoria_uso */
  ccategotr?: number | string;
  /** Código La Mundial de categoría de uso (numérico) — set por getCategoriasUso al elegir versión */
  ccategoria_uso?: number | string;
  /** Etiqueta legible de la categoría de uso (ej. "Auto particular") — para display */
  xcategoria_uso?: string;
  /** Tipo de vehículo INMA (1=particular, 2=rústico, 3=carga…) — set al elegir versión. Usado en planesRcv. */
  ctipo?: number;
  /** Serial del motor — opcional, máx. 60 caracteres. Aparece en el documento del vehículo. */
  serialMotor?: string;
  /** Peso del vehículo en toneladas (nullable; default 60 en backend si no se envía). */
  ntoneladas?: number;
}

export interface PolicyQuote {
  /** Prima anual en bolivares (VES). */
  mprima: number;
  /** Prima anual en dolares (USD). */
  mprimaext: number;
  /** Tasa de cambio Bs/USD usada en la cotizacion. */
  ptasa: number;
  /** Etiqueta legible del vehiculo cotizado (ej. "TOYOTA / COROLLA"). */
  vehicleLabel?: string;
  /** Indica si La Mundial uso el catalogo por defecto (vehiculo no encontrado). */
  vehicleFallback?: boolean;
}

export type QuoteState = 'idle' | 'loading' | 'ready' | 'error';

export interface IssuedPolicy {
  /** Numero de poliza La Mundial (ej. "18-1-0000048127"). Tambien expuesto como `number`. */
  number: string;
  cnpoliza: string;
  /** Numero de recibo La Mundial (ej. "18-100143232"). */
  cnrecibo?: string;
  /** URL al PDF emitido por La Mundial. */
  urlpoliza?: string;
  /** URL al PDF del Anexo Conductor Habitual generado internamente. */
  url_conductor_habitual?: string;
  /** URL PDF Club Arys (cobertura ccober=15). */
  url_club_arys?: string;
  /** URL comprobante ingreso de caja Sis2000. */
  url_ingreso_caja?: string;
  /** Identificador interno (no es el numero oficial). */
  internalPolicyId?: string;
  ncuota?: number;
  emittedAt: string;
  quote?: PolicyQuote;
}

export interface WizardState {
  step: number;
  /** Producto activo del flujo (rcv | funerario). Se propaga entre módulos. */
  product: ProductId;
  documents: Record<DocType, DocumentState>;
  ocrDone: boolean;
  tomador: TomadorData;
  /** Datos del producto Funerario (personas). Solo se usa si product = 'funerario'. */
  funeral: FuneralData;
  /** Frecuencia de pago RCV (plan automóvil). */
  rcv: RcvPlanData;
  sameInsured: boolean;
  asegurado: PersonData;
  /** True cuando quien rellena el formulario NO es quien va a pagar la póliza. */
  differentPayer: boolean;
  /** Datos del pagador alternativo cuando differentPayer = true. */
  pagador: PersonData;
  hasBeneficiary: boolean;
  beneficiario: PersonData;
  hasDriver: boolean;
  conductor: PersonData;
  vehicle: VehicleData;
  category: string;
  selectedPlan: Plan | null;
  paymentMethod: PaymentMethod;
  paymentVerified: boolean;
  /** Datos del pago verificado para activar recibo en Sis2000 al emitir. */
  paymentCapture?: PaymentCapture | null;
  policy: IssuedPolicy | null;
  /** Cotizacion vigente desde La Mundial (mprima/mprimaext/ptasa). */
  quote: PolicyQuote | null;
  /** Estado de la cotizacion para feedback en UI. */
  quoteState: QuoteState;
  /** Mensaje de error de la cotizacion (si quoteState === 'error'). */
  quoteError: string | null;
  /** Snapshot del vehiculo con el que se hizo la ultima cotizacion. Sirve para
   *  invalidar la quote si cambian datos relevantes (placa, marca, modelo, año, uso). */
  quoteVehicleSignature: string | null;
  /** Checkout genérico (cualquier concepto). Prioridad sobre plan/quote legacy. */
  checkout: CheckoutData | null;
  checkoutRules: CheckoutRules | null;
  checkoutPayload: Record<string, unknown> | null;
  checkoutPayer: CheckoutPayer | null;
  /** Metadata canal SSO (cproductor, cramo, etc.) — igual que emisión. */
  metadataCanal: Record<string, unknown> | null;
  diligencia: import('../lib/diligencia').DiligenciaState | null;
  /** Link de pago post-aprobación funerario */
  funeralApprovedCheckout?: boolean;
  funeralSubmissionId?: string;
  funeralPaymentExpiresAt?: string;
}
