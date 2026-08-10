import { useState } from 'react';
import { useWizardStore } from './store/wizardStore';
import { TopStepper } from './components/TopStepper';
import { TopProgressBar } from './components/TopProgressBar';
import { AuroraBackground } from './components/AuroraBackground';
import { Toaster } from './components/Toaster';
import { WelcomeSplash } from './components/WelcomeSplash';
import { Button } from './components/ui/Button';
import { PaymentStep } from './features/payment/PaymentStep';
import { SuccessStep } from './features/payment/SuccessStep';
import { emitPolicy, emitFuneral, emitExelixiPolicy, PolicyEmitError } from './lib/api';
import { isFunerario, isRcv, isExelixiCatalogProduct } from './lib/product';
import { readStoredBuilderProduct } from './lib/exelixi-catalog';
import {
  isEmbeddedMetadataCheckout,
  isGenericCheckoutMode,
  isPaymentBypassEnabled,
  requiresPaymentBeforeContinue,
} from './lib/checkout';
import { useNexusTokenMetadata } from './hooks/useNexusTokenMetadata';
import { toast } from './store/toastStore';
import { Zap, ShieldCheck, Sparkles } from 'lucide-react';
import type { PaymentEmitContext } from './types';

export default function App() {
  useNexusTokenMetadata();
  const store = useWizardStore();
  const { step, goTo, setPolicy } = store;
  const [emitting, setEmitting] = useState(false);

  const isSuccess = step === 6;
  const funeralFlow = isFunerario();
  const rcvFlow = isRcv();
  const exelixiFlow = isExelixiCatalogProduct();
  const genericCheckout = isGenericCheckoutMode(store);
  const embeddedCheckout = isEmbeddedMetadataCheckout(store);
  const paymentBypass = isPaymentBypassEnabled();
  const paymentRequired = requiresPaymentBeforeContinue(store, funeralFlow);

  /** Funerario legacy: emitir sin bloquear por verificación bancaria. */
  const canEmitFuneral = funeralFlow && !genericCheckout && !emitting;
  /** RCV legacy: exige pago verificado salvo bypass QA. */
  const canEmitRcv =
    rcvFlow &&
    !exelixiFlow &&
    !genericCheckout &&
    !emitting &&
    (!paymentRequired || store.paymentVerified);
  /** Exélixi catálogo: emite vía product-emission tras pago (o bypass QA). */
  const canEmitExelixi =
    exelixiFlow &&
    !genericCheckout &&
    !emitting &&
    (!paymentRequired || store.paymentVerified);
  /** Checkout genérico: respeta rules.requirePayment. */
  const canCompleteGeneric =
    genericCheckout &&
    !emitting &&
    (!paymentRequired || store.paymentVerified);

  /** Estado para emisión RCV — lee el store fresco (evita race tras verificar pago). */
  function buildRcvEmitState(paymentCtx?: PaymentEmitContext) {
    const snap = useWizardStore.getState();
    const paymentVerified = paymentCtx?.paymentVerified ?? snap.paymentVerified;
    const paymentCapture = paymentCtx?.paymentCapture ?? snap.paymentCapture;
    return {
      product: 'rcv' as const,
      tomador: snap.tomador,
      sameInsured: snap.sameInsured,
      asegurado: snap.asegurado,
      differentPayer: snap.differentPayer,
      pagador: snap.pagador,
      hasBeneficiary: snap.hasBeneficiary,
      beneficiario: snap.beneficiario,
      hasDriver: snap.hasDriver,
      conductor: snap.conductor,
      vehicle: snap.vehicle,
      category: snap.category,
      selectedPlan: snap.selectedPlan,
      paymentMethod: snap.paymentMethod,
      paymentVerified,
      paymentCapture,
      metadataCanal: snap.metadataCanal,
      checkout: snap.checkout,
      checkoutPayload: snap.checkoutPayload,
    };
  }

  /** Estado para emisión funerario — incluye cuestionario de salud y personas. */
  function buildFuneralEmitState() {
    const snap = useWizardStore.getState();
    return {
      product: 'funerario' as const,
      tomador: snap.tomador,
      funeral: snap.funeral,
      sameInsured: snap.sameInsured,
      asegurado: snap.asegurado,
      hasBeneficiary: snap.hasBeneficiary,
      beneficiario: snap.beneficiario,
      selectedPlan: snap.selectedPlan,
      paymentMethod: snap.paymentMethod,
      metadataCanal: snap.metadataCanal,
      checkout: snap.checkout,
      checkoutPayload: snap.checkoutPayload,
    };
  }

  function applyEmissionResult(result: Awaited<ReturnType<typeof emitPolicy>>) {
    setPolicy({
      number: result.policy.number,
      cnpoliza: result.policy.cnpoliza,
      cnrecibo: result.policy.cnrecibo,
      urlpoliza: result.policy.urlpoliza,
      url_conductor_habitual: result.policy.url_conductor_habitual,
      internalPolicyId: result.policy.internalPolicyId,
      ncuota: result.policy.ncuota,
      emittedAt: result.policy.emittedAt,
      quote: result.policy.quote,
    });

    if (result.policy.urlpoliza) {
      window.open(result.policy.urlpoliza, '_blank', 'noopener,noreferrer');
    }
    if (result.policy.url_conductor_habitual) {
      // Evitar bloqueo del popup al abrir dos PDFs seguidos
      setTimeout(() => {
        window.open(result.policy.url_conductor_habitual!, '_blank', 'noopener,noreferrer');
      }, 400);
    }

    const docHint = result.policy.url_conductor_habitual
      ? ' · PDFs abiertos en nuevas pestañas'
      : result.policy.urlpoliza
        ? ' · PDF abierto en nueva pestaña'
        : '';
    toast.success(
      '¡Póliza emitida!',
      `Número ${result.policy.cnpoliza}${docHint}`,
      6000,
    );

    const meta = result.policy.metadata as { collectionError?: string; collectionSkipped?: string } | undefined;
    if (meta?.collectionError) {
      toast.warning(
        'Póliza emitida — cobro pendiente',
        `La póliza se creó pero el recibo no se activó: ${meta.collectionError}`,
        10000,
      );
    } else if (meta?.collectionSkipped) {
      toast.warning(
        'Póliza emitida — cobro omitido',
        'El recibo quedó pendiente; verifica que el pago esté registrado en el banco.',
        8000,
      );
    }

    goTo(6);
  }

  /** Estado para emisión Exélixi genérica (product-builder + nest-api). */
  function buildExelixiEmitState(paymentCtx?: PaymentEmitContext) {
    const snap = useWizardStore.getState();
    const paymentVerified = paymentCtx?.paymentVerified ?? snap.paymentVerified;
    const paymentCapture = paymentCtx?.paymentCapture ?? snap.paymentCapture;
    const builder = readStoredBuilderProduct();
    const branch = builder?.branch ?? '';
    const hasVehicle = branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO';
    // Solo envía los formularios del ramo: sin vehículo en personas/patrimonial,
    // sin asegurado/beneficiario extra si los toggles están apagados (como La Mundial).
    return {
      product: 'exelixi-catalog' as const,
      builderProduct: builder,
      tomador: snap.tomador,
      sameInsured: snap.sameInsured,
      asegurado: snap.sameInsured === false ? snap.asegurado : snap.tomador,
      hasBeneficiary: snap.hasBeneficiary,
      beneficiario: snap.hasBeneficiary ? snap.beneficiario : undefined,
      vehicle: hasVehicle ? snap.vehicle : undefined,
      funeral: snap.funeral,
      category: snap.category,
      selectedPlan: snap.selectedPlan,
      quote: snap.quote,
      paymentMethod: snap.paymentMethod,
      paymentVerified,
      paymentCapture,
    };
  }

  async function handleContinuarExelixi(paymentCtx?: PaymentEmitContext) {
    const snap = useWizardStore.getState();
    const verified = paymentCtx?.paymentVerified ?? snap.paymentVerified;
    if (paymentRequired && !verified) {
      toast.warning(
        'Pago pendiente',
        'Verifica o confirma el pago con el banco antes de emitir.',
      );
      return;
    }

    setEmitting(true);
    try {
      const result = await emitExelixiPolicy({ state: buildExelixiEmitState(paymentCtx) });
      applyEmissionResult(result);
    } catch (err) {
      handleEmissionError(err);
    } finally {
      setEmitting(false);
    }
  }

  async function handleContinuarRcv(paymentCtx?: PaymentEmitContext) {
    const snap = useWizardStore.getState();
    const verified = paymentCtx?.paymentVerified ?? snap.paymentVerified;
    if (paymentRequired && !verified) {
      toast.warning(
        'Pago pendiente',
        'Verifica o confirma el pago con el banco antes de continuar.',
      );
      return;
    }

    setEmitting(true);
    try {
      const planCode = snap.selectedPlan?.cplan ?? 'RCVBAS';
      const result = await emitPolicy({
        state: buildRcvEmitState(paymentCtx),
        plan: planCode as 'RCVBAS' | 'RUSPAT',
        frecuencia: 'A',
      });
      applyEmissionResult(result);
    } catch (err) {
      handleEmissionError(err);
    } finally {
      setEmitting(false);
    }
  }

  async function handleGenericComplete() {
    if (paymentRequired && !store.paymentVerified) {
      toast.warning('Pago pendiente', 'Confirma el pago antes de continuar.');
      return;
    }

    const mode = store.checkoutRules?.onSuccess?.mode ?? 'none';
    const redirectUrl = store.checkoutRules?.onSuccess?.redirectUrl;
    const webhookUrl = store.checkoutRules?.onSuccess?.webhookUrl;

    if (mode === 'emit') {
      if (funeralFlow) {
        await handleEmitir();
        return;
      }
      if (rcvFlow || store.selectedPlan?.cplan) {
        await handleContinuarRcv();
        return;
      }
      toast.warning(
        'Emisión no configurada',
        'El checkout no incluye datos para emitir póliza.',
      );
      return;
    }

    if (mode === 'webhook' && webhookUrl) {
      setEmitting(true);
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            checkout: store.checkout,
            paymentCapture: store.paymentCapture,
            payload: store.checkoutPayload,
          }),
        });
        toast.success('Pago registrado', 'Notificación enviada correctamente.', 5000);
        goTo(6);
      } catch {
        toast.error('Error', 'No se pudo notificar al sistema origen.');
      } finally {
        setEmitting(false);
      }
      return;
    }

    if (mode === 'redirect' && redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }

    toast.success('Pago completado', 'Operación registrada correctamente.', 5000);
    goTo(6);
  }

  function handlePrimaryAction() {
    if (genericCheckout) {
      void handleGenericComplete();
      return;
    }
    if (exelixiFlow) {
      void handleContinuarExelixi();
      return;
    }
    if (funeralFlow) {
      void handleEmitir();
      return;
    }
    void handleContinuarRcv();
  }

  const primaryDisabled = genericCheckout
    ? !canCompleteGeneric
    : exelixiFlow
      ? !canEmitExelixi
      : funeralFlow
        ? !canEmitFuneral
        : !canEmitRcv;

  const primaryLabel = genericCheckout
    ? (emitting ? 'Procesando...' : 'Continuar')
    : exelixiFlow
      ? store.paymentVerified
        ? (emitting ? 'Emitiendo póliza Exélixi...' : 'Emitir póliza')
        : paymentBypass && !emitting
          ? 'Emitir (sin pago · QA)'
          : (emitting ? 'Emitiendo...' : 'Verificar pago para emitir')
      : funeralFlow
      ? (emitting ? 'Emitiendo póliza...' : 'Emitir póliza')
      : store.paymentVerified
        ? (emitting ? 'Emitiendo y activando recibo...' : 'Reemitir póliza')
        : paymentBypass && !emitting
          ? 'Continuar (sin pago · QA)'
          : (emitting ? 'Emitiendo póliza...' : 'Verificar pago para emitir');

  async function handleEmitir() {
    if (!funeralFlow) return;

    if (!store.funeral?.healthQuestionnaireDone) {
      toast.warning(
        'Cuestionario pendiente',
        'Completa el cuestionario de salud al confirmar el plan antes de emitir.',
      );
      return;
    }
    if (!store.funeral?.aceptaTerminos) {
      toast.warning(
        'Términos pendientes',
        'Debes aceptar los términos en el cuestionario de salud.',
      );
      return;
    }

    setEmitting(true);
    try {
      const result = await emitFuneral({
        state: buildFuneralEmitState(),
        frecuencia: (store.funeral?.frecuencia as 'A' | 'S' | 'M' | 'T' | 'C') ?? 'M',
      });
      applyEmissionResult(result);
    } catch (err) {
      handleEmissionError(err);
    } finally {
      setEmitting(false);
    }
  }

  return (
    <div className="min-h-screen relative">
      <WelcomeSplash />
      <Toaster />
      <AuroraBackground />
      <div className="lg:hidden">
        {!genericCheckout && <TopProgressBar />}
      </div>

      <div>
        <main
          className={`flex-1 min-h-screen px-4 sm:px-6 lg:px-10 ${
            genericCheckout ? 'pb-12' : 'pb-32 lg:pb-12'
          } ${genericCheckout ? 'pt-10' : 'pt-[72px] lg:pt-10'}`}
        >
          <div className="max-w-5xl mx-auto">
            {!genericCheckout && <TopStepper />}

            {!isSuccess && (
              <header className="mb-8 animate-fade-in">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                      <Sparkles size={11} className="text-indigo-500" />
                      {genericCheckout ? 'Pago' : 'Paso 05 · Checkout'}
                    </p>
                    <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                      {genericCheckout ? 'Realiza tu pago' : 'Confirma y paga'}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                      {embeddedCheckout
                        ? 'Al verificar el pago, tu sistema recibirá el resultado automáticamente.'
                        : genericCheckout
                          ? 'Revisa el detalle y confirma el método de pago.'
                          : 'Una conexión cifrada protege la operación de extremo a extremo.'}
                    </p>
                  </div>
                </div>
              </header>
            )}

            <section className="surface-card overflow-hidden step-enter">
              <div className="p-6 sm:p-8 lg:p-10">
                {!isSuccess && (
                  <PaymentStep
                    onPaymentVerified={
                      exelixiFlow && !genericCheckout
                        ? handleContinuarExelixi
                        : rcvFlow && !genericCheckout
                          ? handleContinuarRcv
                          : undefined
                    }
                  />
                )}
                {isSuccess && <SuccessStep />}
              </div>

              {!isSuccess && !embeddedCheckout && (
                <div className="hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span className="font-medium">Cifrado de extremo a extremo · TLS 1.3</span>
                  </div>
                <div className="flex flex-col items-end gap-1.5">
                  {paymentRequired && !store.paymentVerified && (
                    <p className="text-[0.65rem] font-semibold text-amber-700">
                      Confirma el pago con el banco para continuar
                    </p>
                  )}
                  <Button
                    variant="primary"
                    onClick={handlePrimaryAction}
                    disabled={primaryDisabled}
                    className="min-w-[180px]"
                    title={
                      paymentRequired && !store.paymentVerified
                        ? 'Debes verificar o confirmar el pago con el banco'
                        : undefined
                    }
                  >
                    {emitting ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" />
                        {primaryLabel}
                      </>
                    ) : (
                      <>
                        <Zap size={15} fill="currentColor" />
                        {primaryLabel}
                      </>
                    )}
                  </Button>
                </div>
                </div>
              )}

              {!isSuccess && embeddedCheckout && (
                <div className="hidden md:flex items-center gap-2 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  <span className="text-xs text-slate-500 font-medium">
                    Cifrado de extremo a extremo · TLS 1.3
                  </span>
                </div>
              )}
            </section>

          </div>
        </main>
      </div>

      {!isSuccess && !embeddedCheckout && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          {paymentRequired && !store.paymentVerified && (
            <p className="text-[0.65rem] font-semibold text-amber-700 text-center mb-2">
              Confirma el pago con el banco para continuar
            </p>
          )}
          <Button
            variant="primary"
            className="w-full"
            onClick={handlePrimaryAction}
            disabled={primaryDisabled}
            title={
              paymentRequired && !store.paymentVerified
                ? 'Debes verificar o confirmar el pago con el banco'
                : undefined
            }
          >
            {primaryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function handleEmissionError(err: unknown) {
  if (err instanceof PolicyEmitError) {
    switch (err.code) {
      case 'LAMUNDIAL_PLATE_ALREADY_INSURED':
        toast.warning(
          'Vehículo con póliza vigente',
          'La Mundial detectó que la placa o el serial de carrocería ya tienen una póliza activa.',
          8000,
        );
        return;
      case 'NEST_API_COUNTER_COLLISION':
        toast.error(
          'Contador de pólizas desfasado',
          'Sis2000 generó un número de póliza que ya existe. Avisa a soporte para sincronizar el contador POL_VEH.',
          9000,
        );
        return;
      case 'INVALID_PAYLOAD':
        toast.error('Datos incompletos', err.details?.[0] ?? err.message, 7000);
        return;
      case 'LAMUNDIAL_SP_OUTDATED':
        toast.error(
          'Servicio temporalmente no disponible',
          'La Mundial está revisando el servicio. Inténtalo en unos minutos.',
          7000,
        );
        return;
      case 'LAMUNDIAL_UNAUTHORIZED':
      case 'LAMUNDIAL_APIKEY_MISSING':
        toast.error(
          'Configuración pendiente',
          'La integración con La Mundial no está disponible. Avisa a soporte.',
          7000,
        );
        return;
      case 'LAMUNDIAL_NETWORK':
        toast.error('Sin conexión con La Mundial', 'Verifica tu red e inténtalo de nuevo.', 6000);
        return;
      default:
        toast.error('No pudimos emitir la póliza', err.message, 7000);
        return;
    }
  }
  toast.error(
    'No pudimos emitir la póliza',
    'Ocurrió un error inesperado. Verifica tu conexión e inténtalo de nuevo.',
    6000,
  );
}
