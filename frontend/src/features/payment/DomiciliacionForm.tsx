import { useEffect, useState } from 'react';
import {
  Landmark, ShieldCheck, Loader2, CheckCircle2, XCircle, ReceiptText,
} from 'lucide-react';
import { Field, Input, Select } from '../../components/ui/FormField';
import { BankSearchSelect } from '../../components/ui/BankSearchSelect';
import { useWizardStore } from '../../store/wizardStore';
import { useBancosSypago } from '../../hooks/useBancosSypago';
import {
  NUMERO_CUENTA_DIGITOS,
  MSG_SIN_RECIBOS_COBRABLES,
  aplicarPrefijoBanco,
  colaCuentaSinPrefijo,
  esCorreoDomiciliacionValido,
  esCuentaBancariaValida,
  mensajeErrorCuentaBanco,
  sanitizarCuentaConBanco,
  filtrarRecibosCobrables,
  formatearCedulaRifDomiciliacion,
  soloLetrasNombre,
  buscarPolizaDomiciliacion,
  getRecibosPendientes,
  registrarDomiciliacionForPolicy,
  type PolizaDomiciliacion,
  type ReciboPendiente,
  type TipoCuentaDomiciliacion,
} from '../../lib/domiciliacion';
import type { PaymentCapture } from '../../types';

type Props = {
  /** Póliza ya existente (checkout) — registra de inmediato. */
  existingPolicy?: { numeroPoliza?: string; polizaId?: string };
  /** Tras autorizar (y registrar si aplica). Dispara auto-emisión en flujos RCV. */
  onAuthorized: (capture: PaymentCapture) => void | Promise<void>;
};

function buildCapture(params: {
  banco: string;
  tipoCuenta: TipoCuentaDomiciliacion;
  numeroCuenta: string;
  titularCuenta: string;
  cedulaTitular: string;
  correo: string;
  afiliacionId?: string | null;
}): PaymentCapture {
  return {
    bankCode: params.banco,
    tipoCuenta: params.tipoCuenta,
    numeroCuenta: params.numeroCuenta.trim(),
    titularCuenta: params.titularCuenta.trim(),
    cci_rif: params.cedulaTitular.trim().toUpperCase(),
    correo: params.correo.trim(),
    paidOn: new Date().toISOString().split('T')[0],
    reference: params.afiliacionId ?? undefined,
    sypagoAfiliacionId: params.afiliacionId ?? undefined,
  };
}

export function DomiciliacionForm({ existingPolicy, onAuthorized }: Props) {
  const { tomador, pagador, differentPayer, checkoutPayer } = useWizardStore();

  const persona = differentPayer ? pagador : tomador;
  const titularDefault = soloLetrasNombre(
    checkoutPayer?.name?.trim() ||
    [persona.nombre, persona.apellido].filter(Boolean).join(' ').trim(),
  );
  const cedulaDefault = checkoutPayer?.documentType && checkoutPayer.documentNumber
    ? formatearCedulaRifDomiciliacion(`${checkoutPayer.documentType}${checkoutPayer.documentNumber}`)
    : persona.identificacion
      ? formatearCedulaRifDomiciliacion(`${persona.tipoDoc || 'V'}${persona.identificacion}`)
      : '';
  const correoDefault = (checkoutPayer?.email?.trim() || (persona.email ?? '')).trim();

  const [banco, setBanco] = useState('');
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuentaDomiciliacion>('AHORROS');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [titularCuenta, setTitularCuenta] = useState(titularDefault);
  const [cedulaTitular, setCedulaTitular] = useState(cedulaDefault);
  const [correo, setCorreo] = useState(correoDefault);
  const [aceptaAutorizacion, setAceptaAutorizacion] = useState(false);
  const bancos = useBancosSypago();

  const [poliza, setPoliza] = useState<PolizaDomiciliacion | null>(null);
  const [recibos, setRecibos] = useState<ReciboPendiente[]>([]);
  const [cargandoPoliza, setCargandoPoliza] = useState(false);
  const [errorPoliza, setErrorPoliza] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [hecho, setHecho] = useState(false);
  const [afiliacionId, setAfiliacionId] = useState<string | null>(null);
  const [mensajeSypago, setMensajeSypago] = useState('');

  useEffect(() => {
    const numero = existingPolicy?.numeroPoliza?.trim();
    if (!numero) return;
    let cancelado = false;
    (async () => {
      setCargandoPoliza(true);
      setErrorPoliza('');
      setPoliza(null);
      setRecibos([]);
      try {
        const encontrada = await buscarPolizaDomiciliacion(numero);
        if (cancelado) return;
        const pendientes = filtrarRecibosCobrables(
          await getRecibosPendientes(encontrada.id),
        );
        if (pendientes.length === 0) {
          setErrorPoliza(MSG_SIN_RECIBOS_COBRABLES);
          setPoliza(null);
          setRecibos([]);
          return;
        }
        setPoliza(encontrada);
        setRecibos(pendientes);
        setTitularCuenta((prev) => prev.trim() || soloLetrasNombre(encontrada.asegurado));
      } catch (err) {
        if (!cancelado) {
          setPoliza(null);
          setRecibos([]);
          setErrorPoliza(
            err instanceof Error
              ? err.message
              : 'No fue posible consultar la póliza.',
          );
        }
      } finally {
        if (!cancelado) setCargandoPoliza(false);
      }
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPolicy?.numeroPoliza]);

  const cuentaValida = esCuentaBancariaValida(numeroCuenta, banco);
  const cuentaError = mensajeErrorCuentaBanco(numeroCuenta, banco);
  const correoValido = esCorreoDomiciliacionValido(correo);
  const correoError = correo.trim() && !correoValido
    ? 'Indica un correo electrónico válido.'
    : '';

  // Mismas reglas que RegistroDomiciliacion: cuenta 20 dígitos + código de banco + cédula + titular + correo.
  const formularioCompleto =
    cuentaValida &&
    Boolean(cedulaTitular.trim()) &&
    Boolean(titularCuenta.trim()) &&
    Boolean(banco) &&
    correoValido;

  const requierePolizaExistente = Boolean(existingPolicy?.numeroPoliza?.trim());
  const polizaListaParaDomiciliar = Boolean(poliza && recibos.length > 0);
  const puedeEnviar =
    formularioCompleto &&
    aceptaAutorizacion &&
    !enviando &&
    !hecho &&
    !cargandoPoliza &&
    (!requierePolizaExistente || polizaListaParaDomiciliar);

  const nombreBanco = bancos.find((b) => b.code === banco)?.label ?? banco;
  const numeroPolizaLabel = poliza?.numeroPoliza || existingPolicy?.numeroPoliza;
  const mostrarDatosBancarios = !requierePolizaExistente || polizaListaParaDomiciliar;

  async function handleAutorizar() {
    if (!puedeEnviar) return;

    setEnviando(true);
    setErrorEnvio('');

    const capture = buildCapture({
      banco,
      tipoCuenta,
      numeroCuenta,
      titularCuenta,
      cedulaTitular,
      correo,
    });

    const numeroPoliza = poliza?.numeroPoliza || existingPolicy?.numeroPoliza?.trim();
    const polizaId = poliza?.id || existingPolicy?.polizaId;

    try {
      if (numeroPoliza && (requierePolizaExistente || poliza)) {
        const res = await registrarDomiciliacionForPolicy({
          numeroPoliza,
          polizaId,
          capture,
        });
        const finalCapture = buildCapture({
          banco,
          tipoCuenta,
          numeroCuenta,
          titularCuenta,
          cedulaTitular,
          correo,
          afiliacionId: res.sypagoAfiliacionId,
        });
        setAfiliacionId(res.sypagoAfiliacionId);
        setMensajeSypago(res.sypagoMensaje || '');
        if (res.estado !== 'ACTIVA') {
          setErrorEnvio(res.sypagoMensaje || 'SyPago no activó la afiliación.');
          setEnviando(false);
          return;
        }
        setHecho(true);
        await onAuthorized(finalCapture);
      } else {
        setHecho(true);
        setMensajeSypago('Datos capturados. La afiliación se enviará a SyPago al emitir la póliza.');
        await onAuthorized(capture);
      }
    } catch (err) {
      setErrorEnvio(err instanceof Error ? err.message : 'No fue posible registrar la domiciliación.');
    } finally {
      setEnviando(false);
    }
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-VE', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  if (hecho && !errorEnvio) {
    return (
      <div className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.4)]">
            <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-800 mb-2">
              {afiliacionId ? 'Domiciliación activada en SyPago' : 'Domiciliación autorizada'}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {afiliacionId && (
                <>
                  <dt className="text-slate-500 font-semibold">ID de afiliación</dt>
                  <dd className="font-mono font-bold text-slate-800 truncate">{afiliacionId}</dd>
                </>
              )}
              <dt className="text-slate-500 font-semibold">Banco</dt>
              <dd className="text-slate-700">{nombreBanco}</dd>
              <dt className="text-slate-500 font-semibold">Cuenta</dt>
              <dd className="font-mono text-slate-700">····{numeroCuenta.slice(-4)}</dd>
              <dt className="text-slate-500 font-semibold">Titular</dt>
              <dd className="text-slate-700 truncate">{titularCuenta}</dd>
              <dt className="text-slate-500 font-semibold">Correo</dt>
              <dd className="text-slate-700 truncate">{correo}</dd>
            </dl>
            {mensajeSypago && (
              <p className="text-[0.65rem] text-emerald-600/80 mt-2">{mensajeSypago}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <p className="text-xs text-slate-500 leading-relaxed">
        {numeroPolizaLabel
          ? 'Afilia la póliza al cobro automático de recibos vía SyPago con los datos de la cuenta.'
          : 'Ingresa los datos de la cuenta. Tras emitir la póliza se enviará la afiliación a SyPago para el cobro automático de recibos.'}
      </p>

      {cargandoPoliza && (
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Consultando póliza y recibos…
        </p>
      )}

      {errorPoliza && requierePolizaExistente && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5">
          <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 font-medium">{errorPoliza}</p>
        </div>
      )}

      {poliza && recibos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 px-4 pt-3 pb-2">
            Recibos pendientes · {poliza.numeroPoliza} — {poliza.asegurado}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-100">
                  <th className="py-2 px-4 font-semibold">Recibo</th>
                  <th className="py-2 px-3 font-semibold">Cuota</th>
                  <th className="py-2 px-3 font-semibold text-right">Monto</th>
                  <th className="py-2 px-4 font-semibold">Vencimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recibos.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        <ReceiptText size={12} className="text-indigo-500" />
                        {r.numeroRecibo}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{r.qcuotas || '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="block font-bold text-slate-800 tabular-nums">
                        Bs {r.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="block text-[10px] text-slate-500 tabular-nums">
                        $ {r.montoExt.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-slate-600">{fecha(r.fechaVencimiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mostrarDatosBancarios && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Banco">
          <BankSearchSelect
            options={bancos}
            value={banco}
            onChange={(code) => {
              setBanco(code);
              setNumeroCuenta((prev) => (code ? aplicarPrefijoBanco(prev, code) : ''));
            }}
          />
        </Field>

        <Field label="Tipo de cuenta">
          <Select
            value={tipoCuenta}
            onChange={(e) => setTipoCuenta(e.target.value as TipoCuentaDomiciliacion)}
          >
            <option value="AHORROS">Ahorros</option>
            <option value="CORRIENTE">Corriente</option>
          </Select>
        </Field>

        <Field
          label="Número de cuenta"
          hint={
            banco
              ? `Código ${banco} fijo · completa los ${NUMERO_CUENTA_DIGITOS - 4} dígitos restantes`
              : 'Selecciona primero el banco; su código se fijará al inicio de la cuenta'
          }
          error={cuentaError}
        >
          <div className="flex items-stretch gap-0">
            <span
              aria-hidden={!banco}
              className="shrink-0 inline-flex items-center justify-center px-3 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 font-mono text-sm tracking-wide text-slate-600 select-none"
            >
              {banco || '----'}
            </span>
            <Input
              value={banco ? colaCuentaSinPrefijo(numeroCuenta, banco) : ''}
              onChange={(e) => {
                if (!banco) return;
                setNumeroCuenta(sanitizarCuentaConBanco(e.target.value, banco));
              }}
              disabled={!banco}
              inputMode="numeric"
              maxLength={NUMERO_CUENTA_DIGITOS - 4}
              placeholder="Completa los 16 dígitos"
              className="font-mono tracking-wide rounded-l-none disabled:bg-slate-50 disabled:cursor-not-allowed"
              aria-label={`Resto del número de cuenta (${NUMERO_CUENTA_DIGITOS - 4} dígitos)`}
            />
          </div>
        </Field>

        <Field label="Cédula / RIF del titular">
          <Input
            value={cedulaTitular}
            onChange={(e) => setCedulaTitular(formatearCedulaRifDomiciliacion(e.target.value, cedulaTitular))}
            placeholder="V-12345678"
            maxLength={11}
            className="uppercase"
          />
        </Field>

        <Field label="Titular de la cuenta" full>
          <Input
            value={titularCuenta}
            onChange={(e) => setTitularCuenta(soloLetrasNombre(e.target.value))}
            placeholder="Nombre y apellido"
            autoComplete="name"
          />
        </Field>

        <Field
          label="Correo electrónico"
          hint="Notificaciones de pagos aceptados o rechazados"
          error={correoError}
          full
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="cliente@correo.com"
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 cursor-pointer">
        <input
          type="checkbox"
          checked={aceptaAutorizacion}
          onChange={(e) => setAceptaAutorizacion(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-indigo-600"
        />
        <span className="text-xs text-slate-600 leading-relaxed">
          <span className="font-bold text-slate-800">Autorizo</span> el débito automático de los recibos
          {numeroPolizaLabel ? (
            <>
              {' '}de mi póliza <span className="font-bold text-slate-800">{numeroPolizaLabel}</span>
            </>
          ) : (
            ' de la póliza a emitir'
          )}
          {' '}a través de SyPago, en la cuenta bancaria indicada, hasta que decida cancelar esta domiciliación.
        </span>
      </label>

      {errorEnvio && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5">
          <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 font-medium">{errorEnvio}</p>
        </div>
      )}

      {!formularioCompleto && (
        <p className="text-[11px] text-slate-400">Completa todos los campos para continuar.</p>
      )}

      <button
        type="button"
        disabled={!puedeEnviar}
        onClick={() => void handleAutorizar()}
        className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:shadow-[0_12px_28px_rgba(79,70,229,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {enviando
          ? <><Loader2 size={16} className="animate-spin" /> Enviando a SyPago...</>
          : <><ShieldCheck size={16} /> {numeroPolizaLabel ? 'Enviar a SyPago' : 'Autorizar domiciliación'}</>
        }
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[0.65rem] text-slate-400">
        <Landmark size={11} />
        Débito automático de recibos · SyPago
      </p>
      </>
      )}
    </div>
  );
}
