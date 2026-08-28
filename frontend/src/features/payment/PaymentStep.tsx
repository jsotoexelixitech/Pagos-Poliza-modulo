import { useEffect, useRef, useState } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input } from '../../components/ui/FormField';
import { BankSearchSelect } from '../../components/ui/BankSearchSelect';
import type { PaymentMethod, PaymentCapture, PaymentEmitContext } from '../../types';
import {
  Smartphone, Lock, ShieldCheck, KeyRound, Landmark,
  Check, Receipt, Sparkles, Loader2, BadgeCheck, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Send, ClipboardCheck,
} from 'lucide-react';
import { formatUsdShort, formatQuoteUsdMoney, formatQuoteVesLabel, formatQuoteVesPaymentInput, formatQuoteTasa } from '../../lib/money';
import { formatTelefono, FORMATTED_PHONE_MAX_LENGTH, isValidPhonePrefix, phoneDigitsOnly } from '../../lib/phone';
import { formatCedulaRif, validateCedulaRif } from '../../lib/cedula-rif';
import { useProductConfig } from '../../hooks/useProductConfig';
import { isExelixiCatalogProduct, getProductConfig } from '../../lib/product';
import {
  resolveFrecuenciaAmounts,
  resolveWizardFrecuenciaCode,
  resolveRcvQuoteBasis,
} from '../../lib/frecuencia';
import {
  getCheckoutPaymentConcept,
  isEmbeddedMetadataCheckout,
  isGenericCheckoutMode,
  isPaymentBypassEnabled,
  scheduleGenericCheckoutReturn,
} from '../../lib/checkout';
import { notifyClientCheckoutStatus } from '../../lib/checkout-notify';
import { isPaymentMethodEnabled, isPagoFraccionado } from '../../lib/payment-methods';
import {
  releaseEmissionPopupSlots,
  reserveEmissionPopupSlots,
} from '../../lib/openEmissionPdfs';
import { BANCOS_VE } from '../../lib/bancos-ve';
import { useBancosSypago } from '../../hooks/useBancosSypago';
import { getCheckoutPolicyRef } from '../../lib/domiciliacion';
import { DomiciliacionForm } from './DomiciliacionForm';
import { isFuneralApprovedCheckout, isFuneralPaymentLinkExpired } from '../../lib/funeral-approved-checkout';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

import {
  verifyMobilePayment,
  MobilePaymentVerifyError,
  type VerifyMobilePaymentResponse,
  sypagoRequestOtp,
  sypagoConfirmOtp,
  pollSypagoStatus,
  isSypagoApproved,
  isSypagoRejected,
  isSypagoPending,
  type SypagoOtpConfirmResponse,
  SypagoError,
  quotePolicy,
  validateFuneralEmission,
  PolicyEmitError,
} from '../../lib/api';

/** Pago móvil usa SUDEBAN local (Meritop / Banco Activo), no la red SyPago. */
const BANCOS_MOVIL = BANCOS_VE;

const PAYMENT_OPTIONS: {
  method: PaymentMethod;
  label: string;
  sub: string;
  Icon: React.ElementType;
}[] = [
  { method: 'mobile',        label: 'Pago móvil',      sub: 'Banco Activo · Verificación automática', Icon: Smartphone },
  { method: 'otp',           label: 'Débito OTP',      sub: 'SyPago · Débito directo', Icon: KeyRound   },
  { method: 'domiciliacion', label: 'Domiciliación',   sub: 'SyPago · Débito automático de recibos', Icon: Landmark },
];

type VerifyStatus = 'idle' | 'loading' | 'success' | 'failed' | 'error';
type OtpStep = 'form' | 'requesting' | 'awaiting_otp' | 'confirming' | 'polling' | 'done' | 'error';

const TODAY_ISO = new Date().toISOString().split('T')[0];

type PaymentStepProps = {
  /** RCV: tras verificar pago, emite póliza y activa recibo en Sis2000. */
  onPaymentVerified?: (ctx: PaymentEmitContext) => void | Promise<void>;
  /** Checkout SSO embebido: continuar tras pago (redirect / webhook). */
  onGenericCheckoutComplete?: () => void | Promise<void>;
};

export function PaymentStep({
  onPaymentVerified,
  onGenericCheckoutComplete,
}: PaymentStepProps = {}) {
  const bancosSypago = useBancosSypago();
  const {
    paymentMethod, setPaymentMethod,
    selectedPlan, quote, quoteState, vehicle, rcv, funeral,
    checkout, checkoutRules, checkoutPayer, checkoutPayload,
    tomador, product: wizardProduct, funeralApprovedCheckout, funeralPaymentExpiresAt,
    sameInsured, asegurado, hasBeneficiary, beneficiario, metadataCanal,
    setQuote, setQuoteState,
    setPaymentVerified,
    setPaymentCapture,
  } = useWizardStore();

  const product = getProductConfig();
  const frecuenciaCode = resolveWizardFrecuenciaCode(product.hasVehicle, rcv?.frecuencia, funeral?.frecuencia);
  const quoteBasis = resolveRcvQuoteBasis(vehicle?.tipoPlaca, rcv?.frecuencia, vehicle?.tipoCarnet);

  const genericCheckout = isGenericCheckoutMode({ checkout });
  const funeralApproved = isFuneralApprovedCheckout({
    funeralApprovedCheckout,
    checkoutRules,
    product: wizardProduct,
  });
  const qaMobileBypass = isPaymentBypassEnabled();
  // Piloto Exélixi o QA RCV: el pago móvil se simula (sin conexión bancaria real).
  const mobilePaymentSimulated = !genericCheckout && (isExelixiCatalogProduct() || qaMobileBypass);

  const producto = new URLSearchParams(window.location.search).get('product') as 'rcv' | 'funerario' ?? 'rcv';
  const { config } = useProductConfig(EMPRESA_ID, producto, 'pagos');

  const pagoFraccionado = isPagoFraccionado({
    fraccionado:
      checkoutRules?.fraccionado ??
      checkoutPayload?.fraccionado ??
      metadataCanal?.fraccionado,
    formaPago:
      checkoutPayload?.forma_pago ??
      checkoutPayload?.formaPago ??
      metadataCanal?.forma_pago,
    frecuencia:
      checkoutPayload?.ifrecuencia ??
      checkoutPayload?.frecuencia ??
      metadataCanal?.ifrecuencia ??
      metadataCanal?.frecuencia ??
      (producto === 'funerario' ? funeral?.frecuencia : rcv?.frecuencia),
  });

  const requireFirstThenDomiciliar = (() => {
    if (!pagoFraccionado) return false;
    if (
      checkoutPayload?.requireFirstPayment === true
      || checkoutRules?.requireFirstPayment === true
    ) {
      return true;
    }
    if (
      checkoutPayload?.requireFirstPayment === false
      || checkoutRules?.requireFirstPayment === false
    ) {
      return false;
    }
    const methods = checkoutRules?.methods || [];
    if (methods.length === 1 && methods[0] === 'domiciliacion') return false;
    return !methods.length || methods.some((m) => m === 'mobile' || m === 'otp');
  })();

  const [fraccionPhase, setFraccionPhase] = useState<'cobro' | 'domiciliar'>(
    requireFirstThenDomiciliar ? 'cobro' : 'domiciliar',
  );
  const [firstCuotaCapture, setFirstCuotaCapture] = useState<PaymentCapture | null>(null);

  const availableMethods = PAYMENT_OPTIONS.filter(opt => {
    if (requireFirstThenDomiciliar) {
      if (fraccionPhase === 'cobro') {
        return opt.method === 'mobile' || opt.method === 'otp';
      }
      return opt.method === 'domiciliacion';
    }
    if (pagoFraccionado) return opt.method === 'domiciliacion';
    if (mobilePaymentSimulated) {
      return opt.method === 'mobile' || opt.method === 'domiciliacion';
    }
    if (!isPaymentMethodEnabled(opt.method, config?.metodos)) return false;
    if (opt.method === 'domiciliacion') return true;
    if (genericCheckout && checkoutRules?.methods?.length) {
      return checkoutRules.methods.includes(opt.method);
    }
    return true;
  });

  useEffect(() => {
    if (!availableMethods.length) return;
    if (!availableMethods.some((m) => m.method === paymentMethod)) {
      setPaymentMethod(availableMethods[0].method);
    }
  }, [availableMethods, paymentMethod, setPaymentMethod]);

  useEffect(() => {
    if (!requireFirstThenDomiciliar) return;
    if (fraccionPhase === 'cobro' && paymentMethod === 'domiciliacion') {
      setPaymentMethod('mobile');
    }
    if (fraccionPhase === 'domiciliar' && paymentMethod !== 'domiciliacion') {
      setPaymentMethod('domiciliacion');
    }
  }, [requireFirstThenDomiciliar, fraccionPhase, paymentMethod, setPaymentMethod]);

  function completeFirstCuotaOrFinish(capture: PaymentCapture) {
    if (requireFirstThenDomiciliar && fraccionPhase === 'cobro') {
      setFirstCuotaCapture(capture);
      setPaymentCapture(capture);
      setFraccionPhase('domiciliar');
      setPaymentMethod('domiciliacion');
      setPaymentVerified(false);
      releaseEmissionPopupSlots();
      return false;
    }
    return true;
  }

  // Si el bridge hidró `quote` pero excluyó `quoteState` (está en HYDRATE_EXCLUDE),
  // el store tiene un quote válido pero quoteState='idle'. Lo corregimos aquí.
  useEffect(() => {
    if (quote !== null && quoteState === 'idle') {
      setQuoteState('ready');
    }
  }, [quote, quoteState, setQuoteState]);

  // Auto-cotizar solo en flujo legacy La Mundial (RCV/funerario sin checkout genérico).
  useEffect(() => {
    if (genericCheckout || isExelixiCatalogProduct()) return;
    if (quoteState === 'ready' || quoteState === 'loading') return;
    if (quote !== null) return; // ya hay quote (caso anterior lo activará)
    const plan = selectedPlan?.cplan;
    if (!plan || !vehicle) return;

    setQuoteState('loading');
    quotePolicy({ state: { vehicle }, plan })
      .then((r) => {
        const sig = `${vehicle.cmarca ?? vehicle.marca ?? '?'}|${vehicle.cmodelo ?? vehicle.modelo ?? '?'}|${plan}`;
        setQuote(
          { mprima: r.mprima, mprimaext: r.mprimaext, ptasa: r.ptasa },
          sig,
        );
      })
      .catch(() => setQuoteState('error'));
  // Solo al montar — el plan y vehículo no cambian en pagos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prellenar pagador desde checkout.payer
  useEffect(() => {
    if (!checkoutPayer) return;
    if (checkoutPayer.phone) setOtpPhone(formatTelefono(checkoutPayer.phone));
    if (checkoutPayer.documentType) setOtpDocType(checkoutPayer.documentType);
    if (checkoutPayer.documentNumber) setOtpDocNum(checkoutPayer.documentNumber);
    if (checkoutPayer.name) setOtpName(checkoutPayer.name);
  // Solo al montar con datos de sesión
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Campos compartidos ────────────────────────────────────────────────
  const [bankCode,    setBankCode]    = useState('');
  const [bankLabel,   setBankLabel]   = useState('');

  // ── Pago móvil (Meritop) ──────────────────────────────────────────────
  const [telefonoPago, setTelPago]   = useState('');
  const [montoPagoM,   setMontoM]    = useState('');
  const [fechaPagoM,   setFechaM]    = useState('');
  const [cedulaPago,   setCedulaPago] = useState('');

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyResult, setVerifyResult] = useState<VerifyMobilePaymentResponse | null>(null);
  const [verifyError,  setVerifyError]  = useState<string>('');
  const autoEmitStarted = useRef(false);
  const autoVerifyStarted = useRef(false);
  const genericCheckoutCompleteStarted = useRef(false);

  const triggerAutoEmit = async (capture: PaymentCapture) => {
    if (!onPaymentVerified || autoEmitStarted.current) return;
    autoEmitStarted.current = true;
    try {
      await onPaymentVerified({ paymentVerified: true, paymentCapture: capture });
    } catch {
      autoEmitStarted.current = false;
      releaseEmissionPopupSlots();
    }
  };

  const finishGenericCheckout = async () => {
    if (!genericCheckout || !onGenericCheckoutComplete) return;
    if (genericCheckoutCompleteStarted.current) return;
    genericCheckoutCompleteStarted.current = true;
    try {
      if (
        isEmbeddedMetadataCheckout({ checkout })
        && scheduleGenericCheckoutReturn({ checkoutPayload, checkoutRules })
      ) {
        return;
      }
      await onGenericCheckoutComplete();
    } catch {
      genericCheckoutCompleteStarted.current = false;
    }
  };

  // ── SyPago Débito OTP ─────────────────────────────────────────────────
  const [otpDocType,   setOtpDocType]   = useState('V');
  const [otpDocNum,    setOtpDocNum]    = useState('');
  const [otpName,      setOtpName]      = useState('');
  const [otpBankCode,  setOtpBankCode]  = useState('');
  const [otpPhone,     setOtpPhone]     = useState('');
  const [otpAmount,    setOtpAmount]    = useState('');
  const [otpCode,      setOtpCode]      = useState('');
  const [otpStep,      setOtpStep]      = useState<OtpStep>('form');
  const [otpError,     setOtpError]     = useState('');
  const [otpResult,    setOtpResult]    = useState<SypagoOtpConfirmResponse | null>(null);
  /** true si el backend respondió con mock local (no llama a SyPago sandbox). */
  const [otpMockLocal, setOtpMockLocal] = useState(false);
  // otpSubmitted: true después del primer intento de "Solicitar OTP"
  const [otpSubmitted, setOtpSubmitted] = useState(false);
  const [otpCooldown,  setOtpCooldown]  = useState(0); // segundos restantes para reenvío

  // Latch síncrono para evitar doble-click en "Confirmar pago".
  // useRef garantiza que el bloqueo ocurre ANTES del siguiente render,
  // a diferencia de setState que necesita un ciclo para propagarse.
  const confirmInFlight = useRef(false);
  const [funeralValidation, setFuneralValidation] = useState<'idle' | 'loading' | 'ok' | 'blocked'>('idle');
  const [funeralValidationMsg, setFuneralValidationMsg] = useState('');

  // Funerario link de pago: validar póliza vigente antes de cobrar (paridad RCV / validateEmissionAuto).
  useEffect(() => {
    if (!funeralApproved || !selectedPlan?.cplan) return;
    let cancelled = false;
    setFuneralValidation('loading');
    setFuneralValidationMsg('');
    validateFuneralEmission({
      state: {
        tomador,
        funeral,
        selectedPlan,
        sameInsured,
        asegurado,
        hasBeneficiary,
        beneficiario,
        quote,
      },
      plan: selectedPlan.cplan,
    })
      .then(() => {
        if (!cancelled) setFuneralValidation('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof PolicyEmitError
          ? err.message
          : 'No se pudo validar la emisión funeraria.';
        setFuneralValidationMsg(msg);
        setFuneralValidation('blocked');
      });
    return () => { cancelled = true; };
  }, [
    funeralApproved,
    selectedPlan?.cplan,
    tomador,
    funeral,
    sameInsured,
    asegurado,
    hasBeneficiary,
    beneficiario,
    quote,
  ]);

  const paymentBlocked = funeralApproved && funeralValidation === 'blocked';
  const funeralLinkExpired = funeralApproved && isFuneralPaymentLinkExpired(funeralPaymentExpiresAt);
  const funeralPayDisabled =
    funeralApproved &&
    (funeralLinkExpired || paymentBlocked || funeralValidation === 'loading' || funeralValidation === 'idle');

  // Resetear estados al cambiar método de pago
  useEffect(() => {
    setVerifyStatus('idle');
    setVerifyResult(null);
    setVerifyError('');
    setOtpStep('form');
    setOtpError('');
    setOtpResult(null);
    setOtpMockLocal(false);
    setOtpCode('');
    setOtpSubmitted(false);
    setOtpCooldown(0);
    setPaymentVerified(false);
    confirmInFlight.current = false;
  }, [paymentMethod, setPaymentVerified]);

  // QA RCV: prellenar pago móvil desde tomador para auto-verificación.
  useEffect(() => {
    if (!mobilePaymentSimulated || !qaMobileBypass || genericCheckout) return;
    if (!bankCode) {
      setBankCode('0171');
      setBankLabel('Banco Activo');
    }
    if (!telefonoPago && tomador.telefono) {
      setTelPago(formatTelefono(tomador.telefono));
    } else if (!telefonoPago) {
      setTelPago(formatTelefono('04141234567'));
    }
    if (!cedulaPago && tomador.identificacion) {
      const doc = `${tomador.tipoDoc || 'V'}${tomador.identificacion}`.replace(/\s/g, '');
      setCedulaPago(formatCedulaRif(doc));
    } else if (!cedulaPago) {
      setCedulaPago(formatCedulaRif('V12345678'));
    }
    if (!fechaPagoM) setFechaM(TODAY_ISO);
  // Solo al montar en modo QA
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza el monto en Bs (checkout SSO o cotización legacy).
  useEffect(() => {
    if (funeralApproved && quote) {
      const amounts = resolveFrecuenciaAmounts(quote, frecuenciaCode, {
        quoteBasis: 'annual-total',
      });
      const vesStr = formatQuoteVesPaymentInput(amounts.installmentVes);
      setMontoM(vesStr);
      setOtpAmount(vesStr);
      return;
    }
    if (genericCheckout && checkout?.totalVes) {
      const vesStr = formatQuoteVesPaymentInput(checkout.totalVes);
      setMontoM(vesStr);
      setOtpAmount(vesStr);
      return;
    }
    if (quoteState !== 'ready' || !quote) return;
    const amounts = resolveFrecuenciaAmounts(quote, frecuenciaCode, { quoteBasis });
    const vesStr = formatQuoteVesPaymentInput(amounts.installmentVes);
    setMontoM(vesStr);
    setOtpAmount(vesStr);
  }, [genericCheckout, checkout, quoteState, quote, frecuenciaCode, quoteBasis, funeralApproved]);

  // Funerario aprobado: precargar pagador desde tomador del snapshot (BD Exélixi).
  useEffect(() => {
    if (!funeralApproved) return;
    if (tomador.tipoDoc) {
      setOtpDocType((prev) => prev || tomador.tipoDoc || 'V');
    }
    if (tomador.identificacion) {
      const digits = String(tomador.identificacion).replace(/\D/g, '');
      setOtpDocNum((prev) => prev || digits);
    }
    const fullName = [tomador.nombre, tomador.apellido].filter(Boolean).join(' ');
    if (fullName) setOtpName((prev) => prev || fullName);
    if (tomador.telefono) {
      setOtpPhone((prev) => prev || formatTelefono(tomador.telefono));
    }
  }, [
    funeralApproved,
    tomador.tipoDoc,
    tomador.identificacion,
    tomador.nombre,
    tomador.apellido,
    tomador.telefono,
  ]);

  // Countdown para reenvío de OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = window.setTimeout(() => setOtpCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [otpCooldown]);

  // Si el store quedó con un método legacy ('card' / 'transfer' que ya no se
  // ofrecen en PAYMENT_OPTIONS), o si el método actual está desactivado, redirigimos 
  // al primer método disponible para evitar pantalla vacía.
  useEffect(() => {
    if (availableMethods.length > 0 && (!paymentMethod || !availableMethods.some(m => m.method === paymentMethod))) {
      setPaymentMethod(availableMethods[0].method);
    }
  }, [paymentMethod, setPaymentMethod, availableMethods]);

  const funeralProductUi = funeralApproved && quoteState === 'ready' && Boolean(quote);
  const isLoadingQuote = !genericCheckout && !funeralProductUi && quoteState === 'loading';
  const hasRealQuote = funeralProductUi || (!genericCheckout && quoteState === 'ready' && Boolean(quote));
  const isQuoteError   = !genericCheckout && !funeralProductUi && quoteState === 'error';
  const hasLockedAmount = genericCheckout || hasRealQuote;
  const productQuoteBasis = product.hasVehicle ? quoteBasis : 'annual-total';

  const freqAmounts = resolveFrecuenciaAmounts(hasRealQuote ? quote : null, frecuenciaCode, {
    quoteBasis: productQuoteBasis,
  });
  const isShortPeriodQuote = productQuoteBasis === 'per-installment';

  const annualUsd = funeralProductUi || !genericCheckout
    ? (isShortPeriodQuote ? freqAmounts.installmentUsd : freqAmounts.annualUsd)
    : genericCheckout
      ? (checkout!.totalUsd ?? checkout!.totalVes)
      : (selectedPlan?.priceNum ?? 0) * 12;
  const annualVes = funeralProductUi || !genericCheckout
    ? (isShortPeriodQuote ? freqAmounts.installmentVes : freqAmounts.annualVes)
    : genericCheckout
      ? checkout!.totalVes
      : 0;
  const headerSuffix = isShortPeriodQuote ? (freqAmounts.periodSuffix || '/ cuota') : '/ año';
  const installmentHint = hasRealQuote && freqAmounts.cuotas > 1
    ? `Monto del 1er recibo (${frecuenciaCode}) · no editable`
    : 'Monto exacto según cotización oficial · no editable';

  const displayTitle = funeralProductUi || !genericCheckout
    ? (selectedPlan?.name ?? 'Plan no seleccionado')
    : (checkout!.title ?? selectedPlan?.name ?? 'Pago en línea');
  const displaySubtitle = genericCheckout && !funeralProductUi ? checkout!.subtitle : null;
  const showProductQuoteBar = funeralProductUi || !genericCheckout;

  // ── Validaciones pago móvil ───────────────────────────────────────────
  const movErrors = {
    banco    : !bankCode                                          ? 'Selecciona el banco'                : '',
    telefono : telefonoPago.length > 0 && !isValidPhonePrefix(telefonoPago)
                 ? 'Prefijo inválido o incompleto (11 dígitos)'
                 : !telefonoPago ? 'El teléfono es obligatorio' : '',
    cedula   : validateCedulaRif(cedulaPago),
    monto    : !montoPagoM                                        ? 'El monto es obligatorio'            : isNaN(parseFloat(montoPagoM)) || parseFloat(montoPagoM) <= 0 ? 'Monto inválido' : '',
    fecha    : !fechaPagoM                                        ? 'La fecha es obligatoria'            : fechaPagoM > TODAY_ISO ? 'La fecha no puede ser futura' : '',
  };
  const pagoMovilListo = Object.values(movErrors).every(e => !e) && isValidPhonePrefix(telefonoPago);

  // ── Función verificar pago móvil ─────────────────────────────────────
  async function handleVerificar() {
    if (!pagoMovilListo || funeralPayDisabled) return;
    if (onPaymentVerified) reserveEmissionPopupSlots();
    setVerifyStatus('loading');
    setVerifyResult(null);
    setVerifyError('');

    // Solo se envía la fecha (YYYY-MM-DD) — la nueva API no requiere hora
    const paidOn = fechaPagoM;

    // Piloto Exélixi / QA RCV: simula la verificación sin llamar a ningún banco.
    if (mobilePaymentSimulated) {
      await new Promise((r) => setTimeout(r, 900));
      const simAmount = parseFloat(montoPagoM);
      const simulated: VerifyMobilePaymentResponse = {
        success: true,
        isVerified: true,
        reference: `SIM-${Date.now().toString().slice(-8)}`,
        verifiedAmount: simAmount,
        verifiedOn: new Date().toISOString(),
        message: qaMobileBypass
          ? 'Pago simulado — QA Exélixi (sin conexión bancaria).'
          : 'Pago simulado — piloto Exélixi (sin conexión bancaria).',
        code: 'SIMULATED',
      };
      setVerifyResult(simulated);
      setVerifyStatus('success');
      const capture: PaymentCapture = {
        reference: simulated.reference ?? undefined,
        amount: simAmount,
        paidOn,
        bankCode: bankCode || undefined,
        sourcePhone: phoneDigitsOnly(telefonoPago) || undefined,
        cci_rif: cedulaPago ? cedulaPago.toUpperCase() : undefined,
        method: 'mobile',
      };
      if (!completeFirstCuotaOrFinish(capture)) return;
      setPaymentVerified(true);
      setPaymentCapture(capture);
      await triggerAutoEmit(capture);
      return;
    }

    try {
      const result = await verifyMobilePayment({
        sourcePhoneNumber : phoneDigitsOnly(telefonoPago),
        bankCode,
        amount            : parseFloat(montoPagoM),
        paidOn,
        cci_rif           : cedulaPago.toUpperCase(),
      });

      setVerifyResult(result);
      setVerifyStatus(result.isVerified ? 'success' : 'failed');
      if (result.isVerified) {
        const capture: PaymentCapture = {
          reference: result.reference ?? undefined,
          amount: result.verifiedAmount ?? parseFloat(montoPagoM),
          paidOn,
          bankCode: bankCode || undefined,
          sourcePhone: phoneDigitsOnly(telefonoPago) || undefined,
          cci_rif: cedulaPago ? cedulaPago.toUpperCase() : undefined,
          method: 'mobile',
        };
        if (!completeFirstCuotaOrFinish(capture)) return;
        setPaymentVerified(true);
        setPaymentCapture(capture);
        await triggerAutoEmit(capture);
        await notifyClientCheckoutStatus({
          checkout,
          checkoutRules,
          checkoutPayload,
          paymentVerified: true,
          code: result.code,
          message: result.message,
          payment: {
            method: 'mobile',
            reference: result.reference,
            amount: result.verifiedAmount ?? parseFloat(montoPagoM),
            paidOn,
            verifiedOn: result.verifiedOn,
            code: result.code,
            message: result.message,
          },
        });
        await finishGenericCheckout();
      } else {
        setPaymentVerified(false);
        releaseEmissionPopupSlots();
        setPaymentCapture(null);
        void notifyClientCheckoutStatus({
          checkout,
          checkoutRules,
          checkoutPayload,
          paymentVerified: false,
          code: result.code || 'PAYMENT_NOT_FOUND',
          message: result.message || 'No se encontró el pago con los datos proporcionados.',
          payment: {
            method: 'mobile',
            amount: parseFloat(montoPagoM),
            paidOn,
            code: result.code,
            message: result.message,
          },
        });
      }
    } catch (err) {
      releaseEmissionPopupSlots();
      const msg = err instanceof MobilePaymentVerifyError
        ? err.message
        : 'Error inesperado al verificar el pago.';
      const code = err instanceof MobilePaymentVerifyError
        ? (err.baCode || err.code)
        : 'VERIFY_ERROR';
      setVerifyError(msg);
      setVerifyStatus('error');
      setPaymentVerified(false);
      setPaymentCapture(null);
      void notifyClientCheckoutStatus({
        checkout,
        checkoutRules,
        checkoutPayload,
        paymentVerified: false,
        code,
        message: msg,
        payment: { method: 'mobile', amount: parseFloat(montoPagoM) || undefined, paidOn },
      });
    }
  }

  // QA / piloto: verificación automática al completar el formulario (botón deshabilitado).
  useEffect(() => {
    if (!mobilePaymentSimulated || paymentMethod !== 'mobile') return;
    if (!pagoMovilListo || verifyStatus !== 'idle' || autoVerifyStarted.current) return;
    autoVerifyStarted.current = true;
    void handleVerificar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobilePaymentSimulated, paymentMethod, pagoMovilListo, verifyStatus]);

  // ── Validaciones OTP (SyPago) ─────────────────────────────────────────
  // Mismo patrón que pago móvil: errores de formato mientras escribe,
  // errores de campo vacío visibles siempre (sin gate de "touched").
  const otpErrors = {
    docNum : otpDocNum.length > 0 && !/^\d{5,10}$/.test(otpDocNum)
               ? 'Solo dígitos, entre 5 y 10 caracteres'
               : !otpDocNum ? 'Número de documento obligatorio' : '',

    name   : otpName.length > 0 && otpName.trim().split(/\s+/).filter(Boolean).length < 2
               ? 'Ingresa nombre y apellido'
               : !otpName.trim() ? 'Nombre obligatorio' : '',

    bank   : !otpBankCode ? 'Selecciona el banco' : '',

    phone  : otpPhone.length > 0 && !isValidPhonePrefix(otpPhone)
               ? 'Prefijo inválido o incompleto (11 dígitos)'
               : !otpPhone ? 'Teléfono obligatorio' : '',

    amount : otpAmount.length > 0 && (isNaN(parseFloat(otpAmount)) || parseFloat(otpAmount) <= 0)
               ? 'Ingresa un monto válido'
               : !otpAmount ? 'Monto obligatorio' : '',
  };
  const otpFormListo = !Object.values(otpErrors).some(e => e);

  async function handleOtpRequest() {
    setOtpSubmitted(true);
    if (!otpFormListo) return;

    setOtpStep('requesting');
    setOtpError('');

    let succeeded = false;
    try {
      const resp = await sypagoRequestOtp({
        documentType  : otpDocType,
        documentNumber: otpDocNum,
        debtorBankCode: otpBankCode,
        debtorPhone   : phoneDigitsOnly(otpPhone),
        amount        : parseFloat(otpAmount),
      });
      if (resp && resp.success === false) {
        throw new SypagoError({ message: resp.message || 'Error al solicitar OTP.', code: 'SYPAGO_ERROR' });
      }
      setOtpMockLocal(Boolean(resp?.mock));
      succeeded = true;
    } catch (err) {
      setOtpError(err instanceof SypagoError ? err.message : 'Error al solicitar OTP.');
      setOtpStep('error');
    }

    if (succeeded) {
      setOtpStep('awaiting_otp');
      setOtpCooldown(60); // 60 s antes de poder reenviar
    }
  }

  async function handleOtpConfirm() {
    // La clave OTP de SyPago tiene entre 6 y 8 dígitos numéricos.
    if (!/^\d{6,8}$/.test(otpCode.trim())) return;

    // Bloqueo síncrono — impide que dos clicks simultáneos pasen al mismo tiempo
    if (confirmInFlight.current) return;
    confirmInFlight.current = true;

    if (onPaymentVerified) reserveEmissionPopupSlots();

    setOtpStep('confirming');
    setOtpError('');
    try {
      const result = await sypagoConfirmOtp({
        documentType  : otpDocType,
        documentNumber: otpDocNum,
        debtorBankCode: otpBankCode,
        debtorPhone   : phoneDigitsOnly(otpPhone),
        debtorName    : otpName,
        amount        : parseFloat(otpAmount),
        otp           : otpCode.trim(),
        concept       : getCheckoutPaymentConcept(checkout),
      });

      let final: SypagoOtpConfirmResponse = result;
      if (
        result.transaction_id &&
        isSypagoPending(result.status, result.statusInfo)
      ) {
        setOtpStep('polling');
        const polled = await pollSypagoStatus(result.transaction_id);
        final = { ...result, ...polled };
      }

      if (isSypagoRejected(final.status, final.statusInfo)) {
        throw new SypagoError({
          message: final.statusInfo?.label || 'El banco rechazó el débito.',
          code   : 'SYPAGO_REJECTED',
        });
      }

      if (!isSypagoApproved(final.status, final.statusInfo)) {
        throw new SypagoError({
          message: 'El pago sigue en proceso. Espera unos minutos y consulta el estado antes de emitir.',
          code   : 'SYPAGO_STILL_PENDING',
        });
      }

      setOtpResult(final);
      setOtpStep('done');
      const capture: PaymentCapture = {
        transactionId: final.transaction_id,
        amount: parseFloat(otpAmount),
        paidOn: TODAY_ISO,
        reference: final.ref_ibp || final.transaction_id,
        bankCode: otpBankCode || undefined,
        method: 'otp',
      };
      if (!completeFirstCuotaOrFinish(capture)) {
        confirmInFlight.current = false;
        return;
      }
      setPaymentVerified(true);
      setPaymentCapture(capture);
      await triggerAutoEmit(capture);
      await notifyClientCheckoutStatus({
        checkout,
        checkoutRules,
        checkoutPayload,
        paymentVerified: true,
        code: final.status || 'ACCP',
        message: final.statusInfo?.label || 'Pago OTP confirmado',
        payment: {
          method: 'otp',
          transactionId: final.transaction_id,
          amount: parseFloat(otpAmount),
          paidOn: TODAY_ISO,
          reference: final.ref_ibp || final.transaction_id,
        },
      });
      await finishGenericCheckout();
      // Latch queda activo en 'done' — no se puede volver a confirmar
    } catch (err) {
      releaseEmissionPopupSlots();
      const msg = err instanceof SypagoError ? err.message : 'Error al confirmar pago.';
      setOtpError(msg);
      setOtpStep('error');
      setPaymentVerified(false);
      void notifyClientCheckoutStatus({
        checkout,
        checkoutRules,
        checkoutPayload,
        paymentVerified: false,
        code: 'OTP_CONFIRM_ERROR',
        message: msg,
        payment: { method: 'otp', amount: parseFloat(otpAmount) || undefined },
      });
      // Liberar latch solo en error para permitir reintentar
      confirmInFlight.current = false;
    }
  }

  async function handleDomiciliacionAuthorized(capture: PaymentCapture) {
    if (onPaymentVerified) reserveEmissionPopupSlots();
    const merged: PaymentCapture = {
      ...(firstCuotaCapture || {}),
      ...capture,
      amount: firstCuotaCapture?.amount ?? capture.amount,
      paidOn: firstCuotaCapture?.paidOn ?? capture.paidOn,
      reference: capture.sypagoAfiliacionId || capture.reference || firstCuotaCapture?.reference,
    };
    setPaymentVerified(true);
    setPaymentCapture(merged);
    await triggerAutoEmit(merged);
    await notifyClientCheckoutStatus({
      checkout,
      checkoutRules,
      checkoutPayload,
      paymentVerified: true,
      code: capture.sypagoAfiliacionId ? 'DOMICILIACION_ACTIVA' : 'DOMICILIACION_AUTORIZADA',
      message: requireFirstThenDomiciliar
        ? (capture.sypagoAfiliacionId
          ? '1ª cuota pagada y domiciliación activada en SyPago'
          : '1ª cuota pagada y domiciliación autorizada. Se afiliará al emitir la póliza.')
        : (capture.sypagoAfiliacionId
          ? 'Domiciliación activada en SyPago'
          : 'Domiciliación autorizada. Se afiliará al emitir la póliza.'),
      payment: {
        method: firstCuotaCapture?.method || 'domiciliacion',
        reference: firstCuotaCapture?.reference || merged.reference,
        sypagoAfiliacionId: capture.sypagoAfiliacionId,
        bankCode: capture.bankCode,
        tipoCuenta: capture.tipoCuenta,
        numeroCuenta: capture.numeroCuenta,
        titularCuenta: capture.titularCuenta,
        cci_rif: capture.cci_rif,
        correo: capture.correo,
        paidOn: merged.paidOn,
        amount: merged.amount,
        firstPaymentMethod: firstCuotaCapture?.method,
        firstPaymentReference: firstCuotaCapture?.reference,
        domiciliacion: true,
        domiciliacionOk: Boolean(capture.sypagoAfiliacionId),
      },
    });
    await finishGenericCheckout();
  }

  return (
    <div className="animate-fade-in space-y-6">
      {funeralLinkExpired && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>Este enlace de pago expiró. Solicita un nuevo correo con el enlace de pago.</span>
        </div>
      )}
      {paymentBlocked && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{funeralValidationMsg || 'No es posible emitir la póliza con los datos actuales.'}</span>
        </div>
      )}
      {funeralApproved && funeralValidation === 'loading' && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <span>Verificando datos de la póliza…</span>
        </div>
      )}
      <p className="text-slate-500 text-sm leading-relaxed -mt-2">
        Confirma el método de pago y emite la póliza. La operación está cifrada de extremo a extremo.
      </p>

      {/* Total bar */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-violet-50/40 to-fuchsia-50/30 p-5 flex items-center justify-between flex-wrap gap-4 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 relative min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 grid place-items-center text-white shadow-[0_8px_22px_rgba(15,26,90,0.32)] shrink-0">
            <Receipt size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-black tracking-widest text-indigo-600 uppercase mb-0.5">
              {showProductQuoteBar
                ? (freqAmounts.cuotas > 1 ? 'Total a pagar (1er recibo)' : 'Total a pagar (prima anual)')
                : genericCheckout && requireFirstThenDomiciliar && fraccionPhase === 'cobro'
                  ? '1ª cuota a pagar'
                  : 'Total a pagar'}
            </p>
            <p className="font-display font-bold text-slate-900 text-sm truncate">
              {displayTitle}
            </p>
            {displaySubtitle && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{displaySubtitle}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {showProductQuoteBar && hasRealQuote && !quote?.vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wider">
                  <BadgeCheck size={9} strokeWidth={2.4} />
                  {isExelixiCatalogProduct() ? 'Tarifa Exélixi' : 'Tarifa La Mundial'}
                </span>
              )}
              {showProductQuoteBar && hasRealQuote && quote?.vehicleFallback && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 uppercase tracking-wider">
                  <AlertTriangle size={9} strokeWidth={2.4} /> Tarifa estimada
                </span>
              )}
              {showProductQuoteBar && isQuoteError && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200 uppercase tracking-wider">
                  <AlertTriangle size={9} strokeWidth={2.4} /> Cotización pendiente
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative text-right">
          <div className="flex items-end gap-1 justify-end">
            {isLoadingQuote && !hasRealQuote ? (
              <span className="text-3xl sm:text-4xl font-display font-black gradient-text-indigo leading-none inline-flex items-center gap-2">
                <Loader2 size={26} className="animate-spin opacity-70" />
                <span className="opacity-50">---</span>
              </span>
            ) : (
              <span className="text-3xl sm:text-4xl font-display font-black gradient-text-indigo leading-none tabular-nums">
                {showProductQuoteBar ? formatQuoteUsdMoney(annualUsd) : formatUsdShort(annualUsd)}
              </span>
            )}
            {showProductQuoteBar && (
              <span className="text-xs text-slate-500 font-semibold pb-1">{headerSuffix}</span>
            )}
          </div>
          {(hasRealQuote || (genericCheckout && !funeralProductUi)) && annualVes > 0 && (
            <p className="text-sm font-display font-black text-indigo-700 mt-1 tabular-nums">
              {showProductQuoteBar
                ? `${formatQuoteVesLabel(annualVes)}${headerSuffix ? ` ${headerSuffix}` : ''}`
                : `Bs ${annualVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          )}
          {showProductQuoteBar && hasRealQuote && !isShortPeriodQuote && freqAmounts.cuotas > 1 && (
            <p className="text-[0.6rem] text-slate-500 mt-0.5 tabular-nums">
              1er recibo: {formatQuoteUsdMoney(freqAmounts.installmentUsd)} ({freqAmounts.periodSuffix.trim()})
            </p>
          )}
          {!showProductQuoteBar && hasRealQuote && quote?.ptasa && quote.ptasa > 0 && (
            <p className="text-[0.6rem] text-slate-500 mt-0.5 tabular-nums">
              Tasa BCV: {formatQuoteTasa(quote.ptasa)}
            </p>
          )}
          {showProductQuoteBar && hasRealQuote && quote?.ptasa && quote.ptasa > 0 && (
            <p className="text-[0.6rem] text-slate-500 mt-0.5 tabular-nums">
              Tasa BCV: {formatQuoteTasa(quote.ptasa)}
            </p>
          )}
        </div>
      </div>

      {genericCheckout && !funeralProductUi && checkout!.lines && checkout!.lines.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Detalle</p>
          {checkout!.lines!.map((line, idx) => (
            <div key={idx} className="flex justify-between text-sm gap-4">
              <span className="text-slate-600">{line.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                Bs {line.amountVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selector de método */}
      <div>
        <p className="text-[0.7rem] font-black text-slate-500 uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
          <Sparkles size={11} className="text-indigo-500" />
          Método de pago
        </p>
        {pagoFraccionado && (
          <p className="text-xs text-slate-500 mb-3">
            {requireFirstThenDomiciliar
              ? (fraccionPhase === 'cobro'
                ? 'Pago fraccionado: primero cobra la 1ª cuota (pago móvil o débito OTP). Luego autorizarás la domiciliación para las cuotas siguientes.'
                : '1ª cuota registrada. Ahora autoriza la domiciliación SyPago para el cobro automático de las cuotas restantes.')
              : 'Esta póliza es de pago fraccionado: el cobro de recibos se hace por domiciliación SyPago.'}
          </p>
        )}
        {requireFirstThenDomiciliar && (
          <div className="mb-3 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider">
            <span className={`px-2 py-1 rounded-full ${fraccionPhase === 'cobro' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
              1 · Cobrar 1ª cuota
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-1 rounded-full ${fraccionPhase === 'domiciliar' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              2 · Domiciliar
            </span>
          </div>
        )}
        {availableMethods.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-bold text-amber-800">No hay métodos de pago disponibles</p>
            <p className="text-xs text-amber-700 mt-1">Por favor, contacta a soporte o revisa la configuración del producto.</p>
          </div>
        ) : (
        <div className={`grid grid-cols-1 gap-3 ${
          availableMethods.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}>
          {availableMethods.map(({ method, label, sub, Icon }) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`
                group relative flex items-center gap-3 p-4 rounded-2xl border text-left transition-all duration-200 overflow-hidden
                ${paymentMethod === method
                  ? 'border-2 border-indigo-500 bg-gradient-to-br from-indigo-50 to-violet-50/40 shadow-[0_12px_30px_-8px_rgba(15,26,90,0.2)] -translate-y-0.5'
                  : 'border border-slate-200 bg-white hover:border-indigo-300 hover:-translate-y-0.5'
                }
              `}
            >
              {paymentMethod === method && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-md">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 transition-all
                ${paymentMethod === method
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-500'
                }`}>
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-sm text-slate-900 leading-tight">{label}</p>
                <p className="text-[0.7rem] text-slate-500 mt-0.5">
                  {mobilePaymentSimulated && method === 'mobile'
                    ? (qaMobileBypass ? 'Simulado · QA pruebas' : 'Simulado · piloto Exélixi')
                    : sub}
                </p>
              </div>
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Formularios */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Lock size={12} className="text-emerald-500" />
            <span className="font-semibold">Conexión segura · Tus datos están protegidos</span>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-[0.62rem] font-bold text-slate-500">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">PCI-DSS</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">SSL</span>
          </span>
        </div>

        {/* ── PAGO MÓVIL ── */}
        {paymentMethod === 'mobile' && (
          <div className="animate-fade-in space-y-4">

            {/* Piloto / QA: sin cuenta bancaria real — el pago se simula */}
            {mobilePaymentSimulated && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-amber-700 mb-1.5">
                  {qaMobileBypass ? 'Modo QA · Pago móvil simulado' : 'Modo piloto Exélixi · Pago simulado'}
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {qaMobileBypass
                    ? 'Los datos se completan automáticamente y la verificación se simula al cargar. No se conecta con el banco; la póliza emite como pagada con referencia SIM-.'
                    : 'Completa los datos del pago y pulsa «Verificar»: la verificación se simula y no se conecta con ningún banco. La póliza se emitirá con una referencia de prueba.'}
                </p>
              </div>
            )}

            {/* Card datos del banco destino (solo flujos La Mundial producción) */}
            {!mobilePaymentSimulated && (
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-400 mb-3">Realiza tu pago a esta cuenta</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 rounded-xl bg-white/80 border border-indigo-100 px-3 py-2.5 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500 grid place-items-center shrink-0 shadow-[0_3px_8px_rgba(99,102,241,0.35)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] text-slate-500 font-semibold">Banco</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight truncate">Banco Activo</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/80 border border-indigo-100 px-3 py-2.5 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-violet-500 grid place-items-center shrink-0 shadow-[0_3px_8px_rgba(139,92,246,0.35)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] text-slate-500 font-semibold">RIF</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight font-mono">J-000846448</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/80 border border-indigo-100 px-3 py-2.5 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 grid place-items-center shrink-0 shadow-[0_3px_8px_rgba(16,185,129,0.35)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l1.079-1.079a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] text-slate-500 font-semibold">Teléfono</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight font-mono">0414-3966962</p>
                  </div>
                </div>
              </div>
              <p className="text-[0.62rem] text-indigo-400 mt-2.5 leading-relaxed">
                ⚡ Envía el pago móvil a este número y luego ingresa los datos del movimiento para verificación automática.
              </p>
            </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* fila 1: banco · teléfono */}
              <Field label="Banco de origen *" error={movErrors.banco}>
                <BankSearchSelect
                  options={BANCOS_MOVIL}
                  value={bankCode}
                  onChange={(code) => {
                    const found = BANCOS_MOVIL.find(b => b.code === code);
                    setBankCode(code);
                    setBankLabel(found?.label ?? '');
                    setVerifyStatus('idle');
                    setPaymentVerified(false);
                  }}
                />
              </Field>

              <Field label="Teléfono de origen *" hint="Número que realizó el pago" error={movErrors.telefono}>
                <Input
                  value={telefonoPago}
                  onChange={(e) => { setTelPago(formatTelefono(e.target.value)); setVerifyStatus('idle'); setPaymentVerified(false); }}
                  placeholder="(0412) 123-4567"
                  type="tel"
                  inputMode="numeric"
                  maxLength={FORMATTED_PHONE_MAX_LENGTH}
                />
              </Field>

              {/* fila 2: fecha */}
              <Field label="Fecha del pago *" error={movErrors.fecha}>
                <Input
                  type="date"
                  value={fechaPagoM}
                  onChange={(e) => { setFechaM(e.target.value); setVerifyStatus('idle'); setPaymentVerified(false); }}
                  max={TODAY_ISO}
                />
              </Field>

              <Field label="Cédula/RIF del titular *" hint="Ej: V-12345678 (máx. 8 dígitos)" error={movErrors.cedula}>
                <Input
                  value={cedulaPago}
                  onChange={(e) => {
                    setCedulaPago(formatCedulaRif(e.target.value));
                    setVerifyStatus('idle');
                    setPaymentVerified(false);
                  }}
                  placeholder="V-12345678"
                  maxLength={11}
                />
              </Field>

              {/* fila 3: monto (ancho completo) — bloqueado cuando hay cotización oficial */}
              <Field
                label="Monto a pagar (Bs)"
                hint={
                  genericCheckout
                    ? 'Monto exacto del checkout · no editable'
                    : hasRealQuote
                    ? installmentHint
                    : isLoadingQuote
                    ? 'Calculando monto en bolívares desde la cotización...'
                    : 'Esperando cotización para calcular el monto'
                }
                error={movErrors.monto}
                full
              >
                <Input
                  value={montoPagoM}
                  onChange={(e) => {
                    if (hasLockedAmount) return;
                    setMontoM(e.target.value.replace(/[^0-9.]/g, ''));
                    setVerifyStatus('idle');
                    setPaymentVerified(false);
                  }}
                  placeholder="198114.50"
                  inputMode="decimal"
                  readOnly={hasLockedAmount}
                  className={hasLockedAmount ? 'bg-slate-50 text-slate-700 font-bold cursor-not-allowed' : ''}
                />
              </Field>
            </div>

            {/* Botón verificar */}
            <button
              type="button"
              disabled={
                funeralPayDisabled ||
                (mobilePaymentSimulated
                  ? true
                  : !pagoMovilListo || verifyStatus === 'loading' || verifyStatus === 'success')
              }
              onClick={handleVerificar}
              className={`
                w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                ${verifyStatus === 'success'
                  ? 'bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)]'
                  : verifyStatus === 'failed' || verifyStatus === 'error'
                  ? 'bg-rose-500 text-white'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:shadow-[0_12px_28px_rgba(79,70,229,0.45)] hover:-translate-y-0.5 active:translate-y-0'
                }
              `}
            >
              {verifyStatus === 'loading' && <Loader2 size={16} className="animate-spin" />}
              {verifyStatus === 'success' && <CheckCircle2 size={16} />}
              {(verifyStatus === 'failed' || verifyStatus === 'error') && <XCircle size={16} />}
              {verifyStatus === 'idle'    && <Smartphone size={16} />}

              {verifyStatus === 'loading' ? (mobilePaymentSimulated ? 'Simulando verificación...' : 'Verificando con Banco Activo...') :
               verifyStatus === 'success' ? (mobilePaymentSimulated ? 'Pago simulado correctamente' : 'Pago verificado correctamente') :
               verifyStatus === 'failed'  ? 'Pago no encontrado · Reintentar' :
               verifyStatus === 'error'   ? 'Error · Reintentar' :
               mobilePaymentSimulated ? 'Verificación automática (QA)' :
               'Verificar pago móvil'}

              {(verifyStatus === 'failed' || verifyStatus === 'error') && (
                <RefreshCw size={13} className="ml-1 opacity-80" />
              )}
            </button>

            {/* Resultado de la verificación */}
            {verifyStatus === 'success' && verifyResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
                    <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 mb-2">
                      {mobilePaymentSimulated
                        ? (qaMobileBypass ? 'Pago simulado — QA Exélixi' : 'Pago simulado — piloto Exélixi')
                        : 'Pago verificado por Banco Activo'}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {verifyResult.reference && (
                        <>
                          <dt className="text-slate-500 font-semibold">Referencia</dt>
                          <dd className="font-mono font-bold text-slate-800">{verifyResult.reference}</dd>
                        </>
                      )}
                      {verifyResult.verifiedAmount != null && (
                        <>
                          <dt className="text-slate-500 font-semibold">Monto verificado</dt>
                          <dd className="font-bold text-emerald-700">
                            Bs {verifyResult.verifiedAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </dd>
                        </>
                      )}
                      {verifyResult.verifiedOn && (
                        <>
                          <dt className="text-slate-500 font-semibold">Fecha confirmada</dt>
                          <dd className="text-slate-700">
                            {new Date(verifyResult.verifiedOn).toLocaleString('es-VE', {
                              dateStyle: 'medium', timeStyle: 'short',
                            })}
                          </dd>
                        </>
                      )}
                      <dt className="text-slate-500 font-semibold">Banco</dt>
                      <dd className="text-slate-700">{bankLabel}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {verifyStatus === 'failed' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Pago no encontrado</p>
                  <p className="text-xs text-amber-700 mt-1">
                    {verifyResult?.message || 'No se encontró el pago con los datos proporcionados.'}
                    {' '}Verifica el teléfono, banco, monto y hora, y vuelve a intentarlo.
                  </p>
                </div>
              </div>
            )}

            {verifyStatus === 'error' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 animate-fade-in flex items-start gap-3">
                <XCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-rose-800">Error al verificar</p>
                  <p className="text-xs text-rose-700 mt-1">{verifyError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DÉBITO OTP (SyPago) ── */}
        {paymentMethod === 'otp' && (
          <div className="animate-fade-in space-y-5">

            {/* Paso 1: formulario */}
            {(otpStep === 'form' || otpStep === 'requesting' || otpStep === 'error') && (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ingresa los datos del pagador. El banco le enviará una clave OTP por SMS o notificación push.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* fila 1: documento · nombre */}
                  <Field label="Documento del pagador" hint="Tipo y número de cédula"
                    error={otpErrors.docNum}>
                    <div className="flex gap-2 w-full">
                      {/* Selector de tipo — ancho fijo, legible en móvil */}
                      <select
                        value={otpDocType}
                        onChange={(e) => setOtpDocType(e.target.value)}
                        className="w-[4.5rem] shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                      >
                        {['V','E','J','G','P'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <Input
                        value={otpDocNum}
                        onChange={(e) => setOtpDocNum(e.target.value.replace(/\D/g, ''))}
                        placeholder="12345678"
                        inputMode="numeric"
                        maxLength={10}
                        className="flex-1 min-w-0"
                      />
                    </div>
                  </Field>

                  <Field label="Nombre completo" error={otpErrors.name}
                    hint="Nombre y apellido">
                    <Input
                      value={otpName}
                      onChange={(e) => setOtpName(e.target.value)}
                      placeholder="Juan Pérez"
                    />
                  </Field>

                  {/* fila 2: banco · teléfono */}
                  <Field label="Banco del pagador" error={otpErrors.bank}>
                    <BankSearchSelect
                      options={bancosSypago}
                      value={otpBankCode}
                      onChange={setOtpBankCode}
                    />
                  </Field>

                  <Field label="Teléfono del pagador" hint="04XX · número en el banco"
                    error={otpErrors.phone}>
                    <Input
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(formatTelefono(e.target.value))}
                      placeholder="(0412) 123-4567"
                      type="tel"
                      inputMode="numeric"
                      maxLength={FORMATTED_PHONE_MAX_LENGTH}
                    />
                  </Field>

                  {/* fila 3: monto (ancho completo) — bloqueado cuando hay cotización oficial */}
                  <Field
                    label="Monto a debitar (Bs)"
                    hint={
                      genericCheckout
                        ? 'Monto exacto del checkout · no editable'
                        : hasRealQuote
                        ? installmentHint
                        : isLoadingQuote
                        ? 'Calculando monto en bolívares desde la cotización...'
                        : 'Esperando cotización para calcular el monto'
                    }
                    error={otpErrors.amount}
                    full
                  >
                    <Input
                      value={otpAmount}
                      onChange={(e) => {
                        if (hasLockedAmount) return;
                        setOtpAmount(e.target.value.replace(/[^0-9.]/g, ''));
                      }}
                      placeholder="198114.50"
                      inputMode="decimal"
                      readOnly={hasLockedAmount}
                      className={hasLockedAmount ? 'bg-slate-50 text-slate-700 font-bold cursor-not-allowed' : ''}
                    />
                  </Field>
                </div>

                {(otpStep === 'error') && otpError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5 animate-fade-in">
                    <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 font-medium">{otpError}</p>
                  </div>
                )}

                {otpSubmitted && !otpFormListo && otpStep !== 'error' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 animate-fade-in">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">Completa todos los campos correctamente para solicitar la OTP.</p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={funeralPayDisabled || otpStep === 'requesting'}
                  onClick={handleOtpRequest}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:shadow-[0_12px_28px_rgba(79,70,229,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {otpStep === 'requesting'
                    ? <><Loader2 size={16} className="animate-spin" /> Enviando OTP al banco...</>
                    : <><Send size={16} /> Solicitar OTP</>
                  }
                </button>
              </>
            )}

            {/* Paso 2: ingresar OTP */}
            {(otpStep === 'awaiting_otp' || otpStep === 'confirming' || otpStep === 'polling') && (
              <div className="space-y-4 animate-fade-in">
                {/* Banner de instrucción */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500 grid place-items-center shrink-0 shadow-md">
                    <Smartphone size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">
                      {otpMockLocal ? 'Mock local (sin SyPago)' : 'Clave OTP enviada'}
                    </p>
                    <p className="text-xs text-indigo-600 mt-1">
                      {otpMockLocal
                        ? 'SYPAGO_MOCK está activo: no se envía correo. Desactívalo para usar el sandbox real de SyPago.'
                        : <>El banco ha enviado una clave de un solo uso al teléfono <span className="font-mono font-bold">{otpPhone}</span>. Ingrésala a continuación para autorizar el débito.</>}
                    </p>
                  </div>
                </div>

                <Field label="Clave OTP" hint="La clave de 6 u 8 dígitos que recibiste por SMS o notificación">
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={8}
                    className="text-center tracking-[0.5em] text-xl font-bold"
                  />
                </Field>

                {otpCode.length > 0 && otpCode.length < 6 && (
                  <p className="text-xs text-amber-600 font-medium -mt-2">
                    La clave OTP debe tener al menos 6 dígitos.
                  </p>
                )}

                {/* Reenviar OTP con countdown */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">
                    {otpCooldown > 0
                      ? <>¿No recibiste el código? Puedes reenviarlo en <span className="font-bold text-slate-700 tabular-nums">{otpCooldown}s</span></>
                      : <>¿No recibiste el código?</>
                    }
                  </div>
                  <button
                    type="button"
                    disabled={otpCooldown > 0 || otpStep === 'confirming' || otpStep === 'polling'}
                    onClick={async () => {
                      setOtpCode('');
                      await handleOtpRequest();
                    }}
                    className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:border-indigo-300 enabled:text-indigo-600 enabled:hover:bg-indigo-50"
                  >
                    <RefreshCw size={12} /> Reenviar código
                  </button>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => { setOtpStep('form'); setOtpCode(''); setOtpSubmitted(false); setOtpCooldown(0); }}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors"
                  >
                    <RefreshCw size={14} /> Cambiar datos
                  </button>
                  <button
                    type="button"
                    disabled={funeralPayDisabled || otpCode.length < 6 || otpStep === 'confirming' || otpStep === 'polling' || confirmInFlight.current}
                    onClick={handleOtpConfirm}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {otpStep === 'confirming'
                      ? <><Loader2 size={16} className="animate-spin" /> Autorizando débito...</>
                      : otpStep === 'polling'
                      ? <><Loader2 size={16} className="animate-spin" /> Consultando estado con el banco...</>
                      : <><ClipboardCheck size={16} /> Confirmar pago</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Paso 3: éxito */}
            {otpStep === 'done' && otpResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.4)]">
                    <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 mb-2">
                      {otpResult.mock ? 'Pago autorizado [MODO PRUEBA]' : 'Pago confirmado por SyPago'}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <dt className="text-slate-500 font-semibold">ID de transacción</dt>
                      <dd className="font-mono font-bold text-slate-800 truncate">{otpResult.transaction_id}</dd>
                      {otpResult.status && (
                        <>
                          <dt className="text-slate-500 font-semibold">Estado</dt>
                          <dd className="font-bold text-emerald-700">{otpResult.statusInfo?.label || otpResult.status}</dd>
                        </>
                      )}
                      <dt className="text-slate-500 font-semibold">Pagador</dt>
                      <dd className="text-slate-700">{otpName}</dd>
                      <dt className="text-slate-500 font-semibold">Monto</dt>
                      <dd className="font-bold text-emerald-700">
                        Bs {parseFloat(otpAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </dd>
                    </dl>
                    <p className="text-[0.65rem] text-emerald-600/70 mt-2">
                      {genericCheckout
                        ? 'Tu sistema recibirá el resultado del pago automáticamente.'
                        : 'Pago aprobado por el banco. Puedes continuar a emitir la póliza.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DOMICILIACIÓN (SyPago) ── */}
        <div className={paymentMethod === 'domiciliacion' ? 'contents' : 'hidden'}>
          <DomiciliacionForm
            existingPolicy={getCheckoutPolicyRef(checkout, checkoutPayload)}
            onAuthorized={handleDomiciliacionAuthorized}
          />
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-6 flex-wrap pt-2 text-[0.7rem] text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span className="font-semibold">Datos protegidos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lock size={13} className="text-emerald-500" />
          <span className="font-semibold">Pago cifrado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Check size={13} className="text-emerald-500" />
          <span className="font-semibold">Sin cargos ocultos</span>
        </div>
      </div>
    </div>
  );
}
