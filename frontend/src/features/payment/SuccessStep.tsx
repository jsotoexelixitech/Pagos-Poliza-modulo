import { useWizardStore } from '../../store/wizardStore';
import { Button } from '../../components/ui/Button';
import { toast } from '../../store/toastStore';
import { isGenericCheckoutMode } from '../../lib/checkout';
import {
  CheckCircle2, Download, RefreshCw, ShieldCheck,
  Calendar, Copy, ExternalLink,
} from 'lucide-react';
import { formatUsdShort } from '../../lib/money';
import { openEmissionPdfs } from '../../lib/openEmissionPdfs';

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
    policy, tomador, selectedPlan, checkout, paymentCapture, reset,
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
  const primaVes = policy?.quote?.mprima;
  const ptasa = policy?.quote?.ptasa;
  const docsPayload = {
    urlpoliza: pdfUrl,
    url_club_arys: arysUrl,
    url_conductor_habitual: conductorUrl,
    url_ingreso_caja: ingresoCajaUrl,
  };

  const handleOpenDocuments = () => {
    if (!hasDocuments) return;
    const opened = openEmissionPdfs(docsPayload);
    toast.success('Abriendo documentos', `${opened.length} archivo(s) en nuevas pestañas.`);
  };

  const copyPolicy = async () => {
    try {
      await navigator.clipboard.writeText(policyNum);
      toast.success('Copiado al portapapeles', `Número ${policyNum}`, 2800);
    } catch {
      toast.error('No se pudo copiar', 'Intenta de nuevo o copia manualmente.');
    }
  };

  const downloadPdf = () => {
    handleOpenDocuments();
  };

  /** QA — Emitir otra: OCR desde cero (Paso 01), sin reutilizar sid de la emisión anterior. */
  const emitAnotherPolicy = () => {
    reset();
    clearClientFlowState();
    window.location.href = getOcrRestartFromZeroUrl();
  };

  if (genericCheckout) {
    const paidAmount = paymentCapture?.amount ?? checkout?.totalVes ?? 0;
    const paidUsd = checkout?.totalUsd ?? paidAmount;

    return (
      <div className="animate-fade-in py-2">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 mb-4">
            <CheckCircle2 size={28} className="text-emerald-600" strokeWidth={2.2} />
          </div>
          <p className="text-[0.7rem] font-bold text-emerald-700 uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
            <ShieldCheck size={11} />
            Pago completado
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
            Operación registrada
          </h2>
          <p className="text-slate-500 max-w-md mx-auto leading-relaxed text-sm">
            El pago fue confirmado. Tu sistema recibirá la notificación automáticamente.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-8">
          <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-7">
            <div className="space-y-4">
              <div>
                <p className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Concepto
                </p>
                <p className="font-semibold text-slate-900 text-lg">{checkout?.title ?? 'Pago en línea'}</p>
                {checkout?.subtitle && (
                  <p className="text-sm text-slate-500 mt-1">{checkout.subtitle}</p>
                )}
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Monto pagado
                  </p>
                  <p className="font-display font-bold text-2xl text-slate-900 tabular-nums">
                    Bs {paidAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                {paidUsd > 0 && (
                  <p className="font-display font-bold text-xl text-slate-700 tabular-nums">
                    {formatUsdShort(paidUsd)}
                  </p>
                )}
              </div>
              {paymentCapture?.reference && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Referencia
                  </p>
                  <p className="font-mono font-bold text-slate-800">{paymentCapture.reference}</p>
                </div>
              )}
            </div>
          </div>
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
          La póliza fue emitida correctamente. Los documentos se abrieron en nuevas pestañas.
        </p>
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
                    {formatUsdShort(primaUsd)}
                  </p>
                  {primaVes ? (
                    <p className="text-[0.65rem] font-semibold text-slate-600 mt-1 tabular-nums">
                      Bs{' '}
                      {primaVes.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  ) : null}
                  {ptasa ? (
                    <p className="text-[0.58rem] text-slate-500 mt-0.5 tabular-nums">
                      Tasa BCV: {ptasa.toFixed(4)}
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

            {pdfUrl ? (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Documento oficial
                </p>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors break-all underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{pdfUrl}</span>
                </a>
              </div>
            ) : null}

            {conductorUrl ? (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Anexo Conductor Habitual
                </p>
                <a
                  href={conductorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors break-all underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{conductorUrl}</span>
                </a>
              </div>
            ) : null}

            {arysUrl ? (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Club Arys
                </p>
                <a
                  href={arysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors break-all underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{arysUrl}</span>
                </a>
              </div>
            ) : null}

            {ingresoCajaUrl ? (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[0.58rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Ingreso de caja
                </p>
                <a
                  href={ingresoCajaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-amber-700 hover:text-amber-900 transition-colors break-all underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{ingresoCajaUrl}</span>
                </a>
              </div>
            ) : null}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[0.66rem] text-slate-500">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span className="font-medium">Verificado · Válido por 12 meses</span>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-3 flex-wrap mb-8">
        <Button
          variant="primary"
          size="lg"
          onClick={downloadPdf}
          disabled={!hasDocuments}
        >
          <Download size={15} />
          Descargar Documentos
        </Button>
      </div>

      <div className="text-center">
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
