import { Lock, User, Shield, AlertTriangle } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { formatUsdShort, vesAnnual } from '../../lib/money';
import {
  isFuneralApprovedCheckout,
  isFuneralPaymentLinkExpired,
} from '../../lib/funeral-approved-checkout';

export function FuneralApprovedSummary() {
  const state = useWizardStore();
  const locked = isFuneralApprovedCheckout(state);
  if (!locked) return null;

  const expired = isFuneralPaymentLinkExpired(state.funeralPaymentExpiresAt);
  const tomador = state.tomador;
  const plan = state.selectedPlan;
  const quote = state.quote;

  return (
    <div className="mb-6 space-y-3">
      {expired && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>Este enlace de pago expiró. Solicita uno nuevo al área técnica.</span>
        </div>
      )}

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-3">
          <Lock size={12} />
          Póliza autorizada — solo pago
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <User size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">
                {[tomador.nombre, tomador.apellido].filter(Boolean).join(' ') || 'Tomador'}
              </p>
              <p className="text-xs text-slate-500">
                {tomador.tipoDoc}-{tomador.identificacion}
              </p>
              <p className="text-xs text-slate-500">{tomador.email}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield size={16} className="text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">{plan?.name ?? 'Plan funerario'}</p>
              {quote && (
                <p className="text-lg font-display font-black text-indigo-700 tabular-nums">
                  {formatUsdShort(quote.mprimaext)}
                  <span className="text-xs font-semibold text-slate-500 ml-2">
                    ({vesAnnual(quote)} Bs)
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          Los datos de tu solicitud están precargados y no se pueden modificar en este paso.
        </p>
      </div>
    </div>
  );
}
