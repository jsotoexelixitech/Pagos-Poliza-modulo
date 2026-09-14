import {
  CheckCircle2, ExternalLink, FileDown, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { toast } from '../../store/toastStore';
import { formatQuoteUsdMoney, formatQuoteVesLabel, resolveQuoteVesAmount } from '../../lib/money';
import { TarjetaLmShell } from './TarjetaLmShell';
import { TarjetaPrimaryButton } from './TarjetaPrimaryButton';
function getTarjetaOcrRestartUrl(): string {
  const configured = import.meta.env.VITE_OCR_CONTINUE_BASE as string | undefined;
  const base = (configured?.replace(/\/$/, '') || '/ocr').replace(/\/$/, '');
  const params = new URLSearchParams({ wizardStep: '1', flujo: 'tarjeta', product: 'rcv' });
  return `${base}/?${params.toString()}`;
}

export function TarjetaSuccessScreen() {
  const { policy, tomador, reset } = useWizardStore();

  const holder = [tomador.nombre, tomador.apellido].filter(Boolean).join(' ') || 'Cliente';
  const policyNum = policy?.cnpoliza || policy?.number || '—';
  const pdfUrl = policy?.urlpoliza || '';
  const conductorUrl = policy?.url_conductor_habitual || '';
  const arysUrl = policy?.url_club_arys || '';
  const ingresoCajaUrl = policy?.url_ingreso_caja || '';

  const primaUsd = policy?.quote?.mprimaext;
  const ptasa = policy?.quote?.ptasa;
  const primaVes = resolveQuoteVesAmount(primaUsd, ptasa, policy?.quote?.mprima);

  const emitAnother = () => {
    reset();
    try {
      sessionStorage.setItem('rcv_tarjeta_public_flow', '1');
      sessionStorage.setItem('exelixi_product', 'rcv');
    } catch {
      /* ignore */
    }
    window.location.href = getTarjetaOcrRestartUrl();
  };

  const copyPolicy = async () => {
    try {
      await navigator.clipboard.writeText(policyNum);
      toast.success('Copiado', `Póliza ${policyNum}`, 2800);
    } catch {
      toast.error('No se pudo copiar', 'Copia manualmente el número de póliza.');
    }
  };

  return (
    <TarjetaLmShell
      title="Activación Completada"
      subtitle="Tu póliza RCV quedó emitida y la tarjeta fue activada en La Mundial."
    >
      <div className="text-center">
        <div className="relative mx-auto mb-4 inline-flex">
          <span className="absolute inset-0 rounded-full bg-emerald-400/25 blur-md" aria-hidden />
          <div className="relative inline-flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
            <CheckCircle2 size={34} className="text-emerald-600" strokeWidth={2.2} />
          </div>
        </div>
        <p className="mb-1 inline-flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-emerald-700">
          <ShieldCheck size={12} />
          Póliza activa
        </p>
      </div>

      <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-400">Tomador</p>
          <p className="font-semibold text-slate-900">{holder}</p>
        </div>
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-400">Número de póliza</p>
          <button
            type="button"
            onClick={() => void copyPolicy()}
            className="font-mono text-lg font-bold text-[#0F1A5A] hover:underline"
            title="Copiar número de póliza"
          >
            {policyNum}
          </button>
        </div>
        {primaVes > 0 && (
          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-400">Prima</p>
            <p className="font-display text-xl font-bold text-slate-900 tabular-nums">
              {formatQuoteVesLabel(primaVes)}
              {primaUsd != null && primaUsd > 0 ? (
                <span className="ml-2 text-sm font-semibold text-slate-500">
                  {formatQuoteUsdMoney(primaUsd)}
                </span>
              ) : null}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#3B6FBF]/30 bg-white px-4 text-sm font-bold text-[#3B6FBF] hover:bg-[#3B6FBF]/5"
          >
            <FileDown size={16} />
            Cuadro de póliza
            <ExternalLink size={14} className="opacity-60" />
          </a>
        ) : null}
        {conductorUrl ? (
          <a
            href={conductorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileDown size={16} />
            Conductor habitual
          </a>
        ) : null}
        {ingresoCajaUrl ? (
          <a
            href={ingresoCajaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileDown size={16} />
            Comprobante ingreso de caja
          </a>
        ) : null}
        {arysUrl ? (
          <a
            href={arysUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileDown size={16} />
            Club Arys
          </a>
        ) : null}
      </div>

      <TarjetaPrimaryButton className="mt-6" onClick={emitAnother}>
        <RefreshCw size={16} aria-hidden />
        Emitir otra póliza
      </TarjetaPrimaryButton>
    </TarjetaLmShell>
  );
}
