import { useState, useEffect } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, RotateCcw, Save, CheckCircle2, AlertTriangle,
  Loader2, Plus, Trash2, ArrowLeftRight, CreditCard, Sparkles,
  ChevronDown, ChevronUp, Smartphone, KeyRound, Building2, Zap, Wifi,
} from 'lucide-react';
import { AuroraBackground } from '../components/AuroraBackground';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

type Tab = 'metodos' | 'mapeador';

interface ApiMapEntry {
  internalKey: string;
  externalKey: string;
  transform?: string;
}

// ── Tipos de método de pago disponibles ──────────────────────────────
type MetodoTipo = 'mobile' | 'otp' | 'transferencia' | 'zelle' | 'tarjetaCredito' | 'custom';

interface DatosBancarios {
  banco?: string;
  telefono?: string;
  cedula?: string;
  nombre?: string;
  cuenta?: string;
  tipoCuenta?: string;
  rif?: string;
  email?: string;
  // para OTP / gateways
  gateway?: string;
  merchantId?: string;
  apiKey?: string;
  // para custom
  [key: string]: string | undefined;
}

interface MetodoPago {
  key: string;
  label: string;
  tipo: MetodoTipo;
  activo: boolean;
  datos: DatosBancarios;
}

// ── Métodos predeterminados del sistema ──────────────────────────────
const METODOS_DEFAULT: MetodoPago[] = [
  {
    key: 'mobile',
    label: 'Pago Móvil (Banco Activo)',
    tipo: 'mobile',
    activo: true,
    datos: { banco: 'Banco Activo', telefono: '', cedula: '', nombre: '' },
  },
  {
    key: 'otp',
    label: 'Débito OTP (SyPago)',
    tipo: 'otp',
    activo: true,
    datos: { gateway: 'SyPago', merchantId: '', apiKey: '' },
  },
  {
    key: 'transferencia',
    label: 'Transferencia Bancaria',
    tipo: 'transferencia',
    activo: false,
    datos: { banco: '', cuenta: '', tipoCuenta: 'corriente', rif: '', nombre: '' },
  },
];

const INTERNAL_FIELDS = ['monto', 'referencia', 'banco', 'fecha_pago', 'metodo_pago'];

// ── Íconos por tipo ────────────────────────────────────────────────
function MetodoIcon({ tipo }: { tipo: MetodoTipo }) {
  const cls = 'w-9 h-9 rounded-xl grid place-items-center shrink-0';
  if (tipo === 'mobile')       return <div className={`${cls} bg-indigo-100 text-indigo-600`}><Smartphone size={18} /></div>;
  if (tipo === 'otp')          return <div className={`${cls} bg-violet-100 text-violet-600`}><KeyRound size={18} /></div>;
  if (tipo === 'transferencia') return <div className={`${cls} bg-sky-100 text-sky-600`}><Building2 size={18} /></div>;
  if (tipo === 'zelle')        return <div className={`${cls} bg-purple-100 text-purple-600`}><Zap size={18} /></div>;
  if (tipo === 'tarjetaCredito') return <div className={`${cls} bg-emerald-100 text-emerald-600`}><CreditCard size={18} /></div>;
  return <div className={`${cls} bg-slate-100 text-slate-500`}><Wifi size={18} /></div>;
}

// ── Formulario de datos según tipo ───────────────────────────────────
function DatosForm({ tipo, datos, onChange }: {
  tipo: MetodoTipo;
  datos: DatosBancarios;
  onChange: (d: DatosBancarios) => void;
}) {
  const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white';
  const lbl = 'text-[11px] font-bold text-slate-500 block mb-1';
  const set = (k: string, v: string) => onChange({ ...datos, [k]: v });

  if (tipo === 'mobile') return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div><label className={lbl}>Banco receptor</label><input className={inp} value={datos.banco ?? ''} onChange={e => set('banco', e.target.value)} placeholder="Banco Activo" /></div>
      <div><label className={lbl}>Teléfono receptor</label><input className={inp} value={datos.telefono ?? ''} onChange={e => set('telefono', e.target.value)} placeholder="04121234567" /></div>
      <div><label className={lbl}>Cédula del titular</label><input className={inp} value={datos.cedula ?? ''} onChange={e => set('cedula', e.target.value)} placeholder="V-12345678" /></div>
      <div><label className={lbl}>Nombre del titular</label><input className={inp} value={datos.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="Razón social o nombre" /></div>
    </div>
  );

  if (tipo === 'otp') return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div><label className={lbl}>Gateway / Procesador</label><input className={inp} value={datos.gateway ?? ''} onChange={e => set('gateway', e.target.value)} placeholder="SyPago" /></div>
      <div><label className={lbl}>Merchant ID</label><input className={inp} value={datos.merchantId ?? ''} onChange={e => set('merchantId', e.target.value)} placeholder="ID del comercio" /></div>
      <div className="sm:col-span-2"><label className={lbl}>API Key / Credencial</label><input className={inp} type="password" value={datos.apiKey ?? ''} onChange={e => set('apiKey', e.target.value)} placeholder="••••••••••••" /></div>
    </div>
  );

  if (tipo === 'transferencia') return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div><label className={lbl}>Banco receptor</label><input className={inp} value={datos.banco ?? ''} onChange={e => set('banco', e.target.value)} placeholder="Banesco" /></div>
      <div>
        <label className={lbl}>Tipo de cuenta</label>
        <select className={inp} value={datos.tipoCuenta ?? 'corriente'} onChange={e => set('tipoCuenta', e.target.value)}>
          <option value="corriente">Corriente</option>
          <option value="ahorro">Ahorro</option>
        </select>
      </div>
      <div><label className={lbl}>N° de cuenta</label><input className={inp} value={datos.cuenta ?? ''} onChange={e => set('cuenta', e.target.value)} placeholder="01340000000000000000" /></div>
      <div><label className={lbl}>RIF / Cédula titular</label><input className={inp} value={datos.rif ?? ''} onChange={e => set('rif', e.target.value)} placeholder="J-12345678-0" /></div>
      <div className="sm:col-span-2"><label className={lbl}>Nombre del titular</label><input className={inp} value={datos.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="Compañía Aseguradora S.A." /></div>
    </div>
  );

  if (tipo === 'zelle') return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div className="sm:col-span-2"><label className={lbl}>Email o teléfono receptor (Zelle)</label><input className={inp} value={datos.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="pagos@empresa.com" /></div>
      <div className="sm:col-span-2"><label className={lbl}>Nombre del receptor</label><input className={inp} value={datos.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="Nombre completo" /></div>
    </div>
  );

  if (tipo === 'tarjetaCredito') return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div><label className={lbl}>Pasarela de pago</label><input className={inp} value={datos.gateway ?? ''} onChange={e => set('gateway', e.target.value)} placeholder="Stripe, Mercado Pago..." /></div>
      <div><label className={lbl}>API Key pública</label><input className={inp} value={datos.merchantId ?? ''} onChange={e => set('merchantId', e.target.value)} placeholder="pk_live_..." /></div>
      <div className="sm:col-span-2"><label className={lbl}>API Key secreta</label><input className={inp} type="password" value={datos.apiKey ?? ''} onChange={e => set('apiKey', e.target.value)} placeholder="sk_live_..." /></div>
    </div>
  );

  // Custom
  return (
    <div className="grid grid-cols-1 gap-4 pt-4 border-t border-slate-100 mt-3">
      <div><label className={lbl}>URL del endpoint (opcional)</label><input className={inp} value={datos.gateway ?? ''} onChange={e => set('gateway', e.target.value)} placeholder="https://api.banco.com/pago" /></div>
      <div><label className={lbl}>Credencial / Token</label><input className={inp} type="password" value={datos.apiKey ?? ''} onChange={e => set('apiKey', e.target.value)} placeholder="••••••••••••" /></div>
      <div><label className={lbl}>Nota o instrucción visible al cliente</label><input className={inp} value={datos.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="Transfiere a la cuenta..." /></div>
    </div>
  );
}

// ── Parsear config legacy (objeto plano) → array ─────────────────────
function parseLegacyMetodos(raw: any): MetodoPago[] {
  if (Array.isArray(raw)) return raw as MetodoPago[];
  if (!raw || typeof raw !== 'object') return METODOS_DEFAULT;

  return METODOS_DEFAULT.map(def => ({
    ...def,
    activo: raw[def.key]?.activo ?? def.activo,
    label: raw[def.key]?.label ?? def.label,
  }));
}

export function PagosConfigPanel() {
  const producto = getProductId();
  const { config, loadState, saving, saveError, saveConfig, resetConfig } =
    useProductConfig(EMPRESA_ID, producto, 'pagos');

  const [tab, setTab] = useState<Tab>('metodos');
  const [saved, setSaved] = useState(false);
  const [apiMap, setApiMap] = useState<ApiMapEntry[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>(METODOS_DEFAULT);
  const [fraccionamientoCuotas, setFraccionamientoCuotas] = useState(false);
  const [frecuencias, setFrecuencias] = useState({ mensual: true, trimestral: false, anual: true });
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newMetodo, setNewMetodo] = useState<{ label: string; tipo: MetodoTipo }>({ label: '', tipo: 'transferencia' });

  useEffect(() => {
    if (!config) return;
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
    setMetodos(parseLegacyMetodos(config.metodos));
    setFraccionamientoCuotas(config.fraccionamientoCuotas ?? false);
    if (config.frecuencias) setFrecuencias(config.frecuencias);
  }, [config]);

  const updateMetodo = (key: string, patch: Partial<MetodoPago>) =>
    setMetodos(prev => prev.map(m => m.key === key ? { ...m, ...patch } : m));

  const updateDatos = (key: string, datos: DatosBancarios) =>
    setMetodos(prev => prev.map(m => m.key === key ? { ...m, datos } : m));

  const removeMetodo = (key: string) => {
    setMetodos(prev => prev.filter(m => m.key !== key));
    setSaved(false);
  };

  const addMetodo = () => {
    if (!newMetodo.label.trim()) return;
    const key = `custom_${Date.now()}`;
    setMetodos(prev => [...prev, {
      key,
      label: newMetodo.label.trim(),
      tipo: newMetodo.tipo,
      activo: true,
      datos: {},
    }]);
    setNewMetodo({ label: '', tipo: 'transferencia' });
    setAddingNew(false);
    setExpandedKey(key);
    setSaved(false);
  };

  const addMapEntry = () => { setApiMap(p => [...p, { internalKey: '', externalKey: '', transform: 'none' }]); setSaved(false); };
  const updateMapEntry = (idx: number, field: keyof ApiMapEntry, val: string) => {
    setApiMap(p => p.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    setSaved(false);
  };
  const removeMapEntry = (idx: number) => { setApiMap(p => p.filter((_, i) => i !== idx)); setSaved(false); };

  async function handleSave() {
    await saveConfig({ apiMap, metodos, fraccionamientoCuotas, frecuencias });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white';

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />

      <div className="pt-[40px] px-4 sm:px-6 lg:px-10 pb-12 w-full max-w-5xl mx-auto relative z-10">
        <header className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black tracking-[0.22em] text-indigo-500 uppercase mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" />
                PARAMETRIZADOR · {producto}
              </p>
              <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                Módulo de Pagos
              </h1>
              <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                Gestiona los métodos de pago, configura datos bancarios de cada conexión y define el mapeador a la API.
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} className="text-white" />
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden animate-fade-in">
          <div className="p-5 sm:p-8">
            {/* Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
              {([['metodos', 'Métodos de Pago', CreditCard], ['mapeador', 'Mapeador API', ArrowLeftRight]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t as Tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            {loadState === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
                <Loader2 size={20} className="animate-spin" /><span className="text-sm">Cargando configuración...</span>
              </div>
            )}

            {loadState === 'error' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 mb-4">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-amber-700 text-sm font-medium">No se pudo cargar la configuración. Se usan los valores por defecto.</p>
              </div>
            )}

            {loadState !== 'loading' && (
              <>
                {/* ── TAB METODOS ── */}
                {tab === 'metodos' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Conexiones de pago</p>
                      <button
                        onClick={() => setAddingNew(v => !v)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors"
                      >
                        {addingNew ? <ChevronUp size={14} /> : <Plus size={14} />}
                        {addingNew ? 'Cancelar' : 'Nueva conexión'}
                      </button>
                    </div>

                    {/* Formulario de nueva conexión */}
                    {addingNew && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 space-y-4 animate-fade-in">
                        <p className="text-xs font-black text-indigo-800 uppercase tracking-wider">Nueva conexión de pago</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1">Nombre visible al cliente *</label>
                            <input className={inp} placeholder="ej: Zelle, Nequi, PayPal..." value={newMetodo.label} onChange={e => setNewMetodo(p => ({ ...p, label: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1">Tipo de método</label>
                            <select className={inp} value={newMetodo.tipo} onChange={e => setNewMetodo(p => ({ ...p, tipo: e.target.value as MetodoTipo }))}>
                              <option value="mobile">Pago Móvil</option>
                              <option value="otp">Débito OTP / Gateway</option>
                              <option value="transferencia">Transferencia Bancaria</option>
                              <option value="zelle">Zelle</option>
                              <option value="tarjetaCredito">Tarjeta de Crédito</option>
                              <option value="custom">Personalizado</option>
                            </select>
                          </div>
                        </div>
                        <button onClick={addMetodo} disabled={!newMetodo.label.trim()} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 transition-all disabled:opacity-40">
                          ✓ Crear conexión
                        </button>
                      </div>
                    )}

                    {/* Lista de métodos */}
                    <div className="space-y-3">
                      {metodos.map(m => (
                        <div
                          key={m.key}
                          className={`rounded-2xl border transition-all duration-200 overflow-hidden ${m.activo ? 'border-indigo-100 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/50 opacity-70'}`}
                        >
                          {/* Cabecera del método */}
                          <div className="flex items-center gap-3 p-4">
                            <MetodoIcon tipo={m.tipo} />
                            <div className="flex-1 min-w-0">
                              <input
                                className="font-bold text-slate-800 text-sm bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none w-full pb-0.5 truncate"
                                value={m.label}
                                onChange={e => { updateMetodo(m.key, { label: e.target.value }); setSaved(false); }}
                              />
                              <p className="text-[10px] text-slate-500 mt-0.5 capitalize">{m.tipo === 'custom' ? 'Personalizado' : m.tipo}</p>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Toggle activo */}
                              <button
                                type="button"
                                onClick={() => { updateMetodo(m.key, { activo: !m.activo }); setSaved(false); }}
                                className={`relative rounded-full transition-colors ${m.activo ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                style={{ width: 40, height: 22 }}
                              >
                                <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${m.activo ? 'translate-x-[18px]' : ''}`} style={{ width: 18, height: 18 }} />
                              </button>

                              {/* Expandir datos */}
                              <button
                                type="button"
                                onClick={() => setExpandedKey(k => k === m.key ? null : m.key)}
                                className="p-2 rounded-xl text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                title="Configurar datos"
                              >
                                {expandedKey === m.key ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>

                              {/* Eliminar (solo custom o no-default) */}
                              {(m.tipo === 'custom' || !['mobile', 'otp'].includes(m.key)) && (
                                <button
                                  type="button"
                                  onClick={() => { if (confirm(`¿Eliminar "${m.label}"?`)) removeMetodo(m.key); }}
                                  className="p-2 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Datos bancarios expandibles */}
                          {expandedKey === m.key && (
                            <div className="px-4 pb-4 animate-fade-in">
                              <DatosForm
                                tipo={m.tipo}
                                datos={m.datos}
                                onChange={d => { updateDatos(m.key, d); setSaved(false); }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <hr className="border-slate-100 my-2" />

                    {/* Opciones de cobro */}
                    <div className="space-y-3">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Opciones de Cobro</p>
                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                        {producto === 'rcv' && (
                          <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={fraccionamientoCuotas} onChange={e => { setFraccionamientoCuotas(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                            <div>
                              <span className="text-sm text-slate-800 font-bold block mb-1">Permitir pago fraccionado (Cuotas)</span>
                              <span className="text-xs text-slate-500">El cliente podrá dividir el pago del RCV en varias cuotas.</span>
                            </div>
                          </label>
                        )}
                        {producto === 'funerario' && (
                          <div className="p-2">
                            <span className="text-sm text-slate-800 font-bold block mb-3">Frecuencias de pago permitidas</span>
                            <div className="flex gap-4 flex-wrap">
                              {(['mensual', 'trimestral', 'anual'] as const).map(freq => (
                                <label key={freq} className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={frecuencias[freq]} onChange={e => { setFrecuencias(p => ({ ...p, [freq]: e.target.checked })); setSaved(false); }} className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                  <span className="text-sm text-slate-700 capitalize">{freq}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB MAPEADOR ── */}
                {tab === 'mapeador' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mapeador de campos API</p>
                        <p className="text-xs text-slate-500 mt-1">Traduce los campos del pago al formato de la API destino.</p>
                      </div>
                      <button onClick={addMapEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        <Plus size={14} /> Nueva regla
                      </button>
                    </div>

                    {apiMap.length === 0 && (
                      <div className="text-center py-12 text-slate-500 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        No hay mapeos. Los campos se enviarán con el nombre interno.
                      </div>
                    )}

                    <div className="space-y-3">
                      {apiMap.map((entry, idx) => (
                        <div key={idx} className="rounded-2xl border border-indigo-100 bg-white/50 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-4 items-end shadow-sm hover:shadow-md hover:bg-white transition-all group">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo origen</label>
                            <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-mono outline-none focus:border-indigo-400" value={entry.internalKey} onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)}>
                              <option value="">— Seleccionar —</option>
                              {INTERNAL_FIELDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo destino (API)</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: p_referencia" value={entry.externalKey} onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Transformación</label>
                            <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-indigo-400" value={entry.transform ?? 'none'} onChange={e => updateMapEntry(idx, 'transform', e.target.value)}>
                              <option value="none">Ninguna</option>
                              <option value="uppercase">MAYÚSCULAS</option>
                              <option value="lowercase">minúsculas</option>
                              <option value="number">A Número</option>
                            </select>
                          </div>
                          <button onClick={() => removeMapEntry(idx)} className="p-2.5 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 self-end">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {loadState !== 'loading' && (
            <div className="px-5 sm:px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              {saveError && (
                <div className="w-full sm:w-auto flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">
                  <AlertTriangle size={14} />{saveError}
                </div>
              )}
              <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                <button onClick={() => { if (confirm('¿Restaurar la configuración original?')) resetConfig(); }} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm">
                  <RotateCcw size={15} /> Restaurar defaults
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-8 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle2 size={16} /> ¡Guardado!</> : <><Save size={16} /> Guardar cambios</>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
