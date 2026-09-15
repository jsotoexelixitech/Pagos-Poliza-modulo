import { useWizardStore } from '../../store/wizardStore';
import { toast } from '../../store/toastStore';
import { isGenericCheckoutMode } from '../../lib/checkout';
import {
  CheckCircle2, RefreshCw, ShieldCheck,
  Calendar, Copy, ExternalLink, FileDown, Receipt,
} from 'lucide-react';
import { formatQuoteUsdMoney, formatQuoteVesLabel, formatQuoteTasaValue, resolveQuoteVesAmount } from '../../lib/money';
import { diligenciaLabel } from '../../lib/diligencia';

/**
 * Reinicio OCR desde cero: sin sid (nueva sesión bridge) + wizardStep=1.
 * Conserva product y nexus_token para no perder el canal.
 */
function getOcrRestartFromZeroUrl(): string {
  const configured = import.meta.env.VITE_OCR_CONTINUE_BASE as string | undefined;
  const base = (configured?.replace(/\/$/, '') || '/ocr').replace(/\/$/, '');
  const params = new URLSearchParams({ wizardStep: '1' });

  try {
    const current = new URL(window.location.href);
    const product =
      current.searchParams.get('product')
      || sessionStorage.getItem('exelixi_product')
      || 'rcv';
    params.set('product', product);

    const nexusToken =
      current.searchParams.get('nexus_token')
      || sessionStorage.getItem('nexus_access_token_pagos')
      || sessionStorage.getItem('nexus_access_token_ocr');
    if (nexusToken) params.set('nexus_token', nexusToken);
  } catch {
    params.set('product', 'rcv');
  }

  return `${base}/?${params.toString()}`;
}

function clearClientFlowState() {
  const keep = new Set([
    'nexus_access_token_pagos',
    'nexus_access_token_ocr',
    'nexus_access_token_formulario',
    'nexus_access_token_emision',
    'exelixi_product',
  ]);
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key && !keep.has(key)) toRemove.push(key);
  }
  toRemove.forEach((k) => sessionStorage.removeItem(k));
}

export function SuccessStep() {
  const {
    policy, tomador, selectedPlan, checkout, paymentCapture, paymentMethod, reset, diligencia,
  } = useWizardStore();

  const genericCheckout = isGenericCheckoutMode({ checkout });

  const holder = [tomador.nombre, tomador.apellido].filter(Boolean).join(' ') || 'Cliente';
  const policyNum = policy?.cnpoliza || policy?.number || 'LM-2026-000000';
  const reciboNum = policy?.cnrecibo || '';
  const pdfUrl = policy?.urlpoliza || '';
  const conductorUrl = policy?.url_conductor_habitual || '';
  const arysUrl = policy?.url_club_arys || '';
  const ingresoCajaUrl = policy?.url_ingreso_caja || '';
  const hasDocuments = Boolean(pdfUrl || conductorUrl || arysUrl || ingresoCajaUrl);
  const emittedDate = policy?.emittedAt
    ? new Date(policy.emittedAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

  const primaUsd = policy?.quote?.mprimaext;
  const ptasa = policy?.quote?.ptasa;
  const primaVes = resolveQuoteVesAmount(primaUsd, ptasa, policy?.quote?.mprima);
  const copyPolicy = async () => {
    try {
      await navigator.clipboard.writeText(policyNum);
      toast.success('Copiado al portapapeles', `Número ${policyNum}`, 2800);
    } catch {
      toast.error('No se pudo copiar', 'Intenta de nuevo o copia manualmente.');
    }
  };


  /** QA — Emitir otra: OCR desde cero (Paso 01), sin reutilizar sid de la emisión anterior. */
  const emitAnotherPolicy = () => {
    reset();
    clearClientFlowState();
    window.location.href = getOcrRestartFromZeroUrl();
  };

  if (genericCheckout) {
    const paidAmount = paymentCapture?.amount ?? checkout?.totalVes ?? 0;
    const paidUsd = checkout?.totalUsd ?? 0;
    const hasPolicy = Boolean(policy?.cnpoliza || policy?.urlpoliza);
    const isDomiciliacion = paymentMethod === 'domiciliacion';

    return (
      <div className="animate-fade-in py-1 sm:py-2">
        <div className="text-center mb-6 sm:mb-8">
          <div className="relative inline-flex mb-4">
            <span className="absolute inset-0 rounded-full bg-emerald-400/25 blur-md" aria-hidden />
            <div className="relative inline-flex items-center justify-center w-[4.25rem] h-[4.25rem] rounded-full bg-gradient-to-b from-emerald-50 to-emerald-100 border border-emerald-200 shadow-sm">
              <CheckCircle2 size={32} className="text-emerald-600" strokeWidth={2.2} />
            </div>
          </div>
          <p className="text-[0.68rem] font-bold text-emerald-700 uppercase tracking-[0.16em] mb-2 inline-flex items-center gap-1.5">
            <ShieldCheck size={12} />
            {hasPolicy ? 'Pago y emisión' : 'Pago confirmado'}
          </p>
          <h2 className="font-display text-[1.65rem] sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
            {hasPolicy
              ? 'Tu póliza ya está lista'
              : isDomiciliacion
                ? 'Domiciliación autorizada'
                : 'Pago registrado con éxito'}
          </h2>
          <p className="text-slate-500 max-w-md mx-auto leading-relaxed text-sm px-2">
            {hasPolicy
              ? 'El cobro se acreditó y la póliza quedó emitida. Descarga el cuadro oficial cuando quieras.'
              : isDomiciliacion
                ? 'La autorización quedó registrada. La emisión continúa cuando el débito se confirme.'
                : 'El cobro se acreditó correctamente. Conserva la referencia de esta operación.'}
          </p>
        </div>

        <div className="max-w-lg mx-auto mb-6 sm:mb-8">
          <div className="overflow-hidden rounded-3xl bg-white border border-slate-200/80 shadow-[0_20px_50px_-24px_rgba(15,26,90,0.35)]">
            <div className="bg-indigo-700 px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <p className="text-white/90 text-[0.68rem] font-bold uppercase tracking-[0.16em] inline-flex items-center gap-2">
                <Receipt size={13} />
                Comprobante
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200 bg-white/10 px-2 py-0.5 rounded-full">
                Acreditado
              </span>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Concepto
                </p>
                <p className="font-semibold text-slate-900 text-lg leading-snug">
                  {checkout?.title ?? 'Pago en línea'}
                </p>
                {checkout?.subtitle && (
                  <p className="text-sm text-slate-500 mt-1">{checkout.subtitle}</p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3.5">
                <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  Monto pagado
                </p>
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <p className="font-display font-bold text-2xl sm:text-[1.75rem] text-slate-900 tabular-nums leading-none">
                    Bs {paidAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {paidUsd > 0 && (
                    <p className="font-display font-bold text-lg text-indigo-700 tabular-nums">
                      {formatQuoteUsdMoney(paidUsd)}
                    </p>
                  )}
                </div>
              </div>

              {paymentCapture?.reference && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Referencia
                    </p>
                    <p className="font-mono font-bold text-slate-800 tracking-wide">
                      {paymentCapture.reference}
                    </p>
                  </div>
                </div>
              )}

              {hasPolicy && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <p className="text-[0.62rem] font-bold text-emerald-700 uppercase tracking-widest mb-1">
                    Número de póliza
                  </p>
                  <p className="font-mono font-bold text-lg text-slate-900 break-all mb-3">
                    {policyNum}
                  </p>
                  {pdfUrl ? (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 hover:bg-indigo-800 transition-colors"
                    >
                      <FileDown size={16} />
                      Abrir cuadro de póliza
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <p className="px-5 sm:px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50/80">
              La Mundial de Seguros · operación verificada
            </p>
          </div>
        </div>

        <div className="text-center mb-4">
          <button
            type="button"
            onClick={emitAnotherPolicy}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-700 transition-colors font-semibold"
          >
            <RefreshCw size={13} />
            Emitir otra póliza
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in py-2">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 mb-4">
          <CheckCircle2 size={28} className="text-emerald-600" strokeWidth={2.2} />
        </div>

        <p className="text-[0.7rem] font-bold text-emerald-700 uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
          <ShieldCheck size={11} />
          Emisión completada
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
          Tu póliza está activa
        </h2>
        <p className="text-slate-500 max-w-md mx-auto leading-relaxed text-sm">
          La póliza fue emitida correctamente.
          {hasDocuments
            ? ' Los documentos se abren automáticamente en nuevas pestañas al emitir.'
            : ' Contacta soporte si necesitas el certificado digital.'}
        </p>
        {(diligencia || tomador.itipoDiligencia) && (
          <p className="mt-3 text-xs font-semibold text-indigo-700">
            {diligenciaLabel(diligencia?.itipoDiligencia ?? tomador.itipoDiligencia ?? 'C')}
          </p>
        )}
      </div>

      <div className="max-w-2xl mx-auto mb-8">
        <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-7">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
            <div>
              <p className="text-[0.65rem] font-bold tracking-widest text-slate-500 uppercase">
                Certificado digital
              </p>
              <p className="text-xs text-slate-500 mt-0.5">La Mundial de Seguros</p>
            </div>
            <div className="flex items-center gap-1.5 text-[0.6rem] font-bold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
              <CheckCircle2 size={10} />
              Activa
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Número de póliza
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-bold text-xl sm:text-2xl text-slate-900 tracking-wide break-all">
                    {policyNum}
                  </p>
                  <button
                    onClick={copyPolicy}
                    className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-700 shrink-0"
                    aria-label="Copiar número"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              </div>

              {primaUsd ? (
                <div className="text-right shrink-0">
                  <p className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Prima anual emitida
                  </p>
                  <p className="font-display font-bold text-xl sm:text-2xl text-slate-900 leading-none tabular-nums">
                    {formatQuoteUsdMoney(primaUsd)}
                  </p>
                  {primaVes > 0 ? (
                    <p className="text-[0.65rem] font-semibold text-slate-600 mt-1 tabular-nums">
                      {formatQuoteVesLabel(primaVes)}
                    </p>
                  ) : null}
                  {ptasa ? (
                    <p className="text-[0.58rem] text-slate-500 mt-0.5 tabular-nums">
                      Tasa BCV: {formatQuoteTasaValue(ptasa)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 pt-4 border-t border-slate-100">
              {[
                { label: 'Titular', value: holder },
                { label: 'Plan', value: selectedPlan?.name ?? 'RCV Básico' },
                { label: 'Recibo', value: reciboNum || '—' },
                { label: 'Emitida', value: emittedDate, icon: <Calendar size={11} /> },
              ].map(({ label, value, icon }) => (
                <div key={label}>
                  <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    {icon}
                    {label}
                  </p>
                  <p className="font-semibold text-slate-800 truncate text-sm">{value}</p>
                </div>
              ))}
            </div>

            {(pdfUrl || conductorUrl || arysUrl || ingresoCajaUrl) ? (
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Documentos
                </p>
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-indigo-900 hover:bg-indigo-100 transition-colors"
                  >
                    <FileDown size={16} className="shrink-0" />
                    <span className="text-sm font-bold flex-1">Cuadro de póliza</span>
                    <ExternalLink size={14} className="text-indigo-600" />
                  </a>
                ) : null}
                {conductorUrl ? (
                  <a
                    href={conductorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                    <ExternalLink size={16} className="shrink-0" />
                    <span className="text-sm font-bold flex-1">Anexo conductor habitual</span>
                  </a>
                ) : null}
                {arysUrl ? (
                  <a
                    href={arysUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                    <ExternalLink size={16} className="shrink-0" />
                    <span className="text-sm font-bold flex-1">Club Arys</span>
                  </a>
                ) : null}
                {ingresoCajaUrl ? (
                  <a
                    href={ingresoCajaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                    <ExternalLink size={16} className="shrink-0" />
                    <span className="text-sm font-bold flex-1">Ingreso de caja</span>
                  </a>
                ) : null}
              </div>
            ) : null}

            {paymentMethod === 'domiciliacion' && paymentCapture?.numeroCuenta ? (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Domiciliación SyPago
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {paymentCapture.sypagoAfiliacionId
                    ? `Afiliación ${paymentCapture.sypagoAfiliacionId}`
                    : 'Autorizada · pendiente de afiliación'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cuenta ····{paymentCapture.numeroCuenta.slice(-4)}
                  {paymentCapture.titularCuenta ? ` · ${paymentCapture.titularCuenta}` : ''}
                  {paymentCapture.correo ? ` · ${paymentCapture.correo}` : ''}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[0.66rem] text-slate-500">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span className="font-medium">Verificado · Válido por 12 meses</span>
          </div>
        </div>
      </div>

      <div className="text-center mb-8">
        <button
          type="button"
          onClick={emitAnotherPolicy}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-semibold"
        >
          <RefreshCw size={13} />
          Emitir otra póliza
        </button>
      </div>
    </div>
  );
}
