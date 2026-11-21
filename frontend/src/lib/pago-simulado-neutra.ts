/**
 * Pago simulado del flujo de prueba MarketPlace (marca neutra).
 *
 * Reutiliza el «modo piloto Exélixi · Pago simulado» de PaymentStep solo si
 * se cumplen TODAS las condiciones:
 *   1. Modo marca neutra activo (`?marca=neutra`).
 *   2. Host del navegador en la lista de entornos de prueba (nunca producción).
 *   3. El server de Pagos lo confirma: GET /api/payments/simulacion-marca-neutra
 *      responde `permitido: true` (exige PAGO_SIMULADO_MARCA_NEUTRA=1, que solo
 *      se pone en el 120, y rechaza hosts de producción).
 *
 * En producción (pagos.exelixitech.com) no se simula aunque llegue marca=neutra.
 */
import axios from 'axios';
import { moduleApiBase } from './app-base';
import { esMarcaNeutra } from './marca';

/** Hosts de producción: jamás simulan, aunque llegue marca=neutra. */
const HOSTS_PRODUCCION = ['pagos.exelixitech.com'];

/** Hosts donde se permite el pago simulado de marca neutra (dev 120 y local). */
const HOSTS_PRUEBA = ['cierrelmds.exelixitech.com', 'localhost', '127.0.0.1'];

export function esHostPagoSimuladoPermitido(hostname: string, mode: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  // Build de producción GCIA: nunca.
  if (String(mode || '').toLowerCase() === 'production.gcia') return false;
  if (HOSTS_PRODUCCION.includes(host)) return false;
  return HOSTS_PRUEBA.includes(host);
}

/** Condiciones locales (sin red): marca neutra + host de prueba. */
export function puedeConsultarPagoSimuladoNeutra(): boolean {
  if (typeof window === 'undefined') return false;
  if (!esMarcaNeutra()) return false;
  return esHostPagoSimuladoPermitido(window.location.hostname, import.meta.env.MODE as string);
}

let consulta: Promise<boolean> | null = null;

/** Confirma con el server de Pagos (una vez por carga; los errores no se cachean). */
export function consultarPagoSimuladoNeutra(): Promise<boolean> {
  if (!puedeConsultarPagoSimuladoNeutra()) return Promise.resolve(false);
  if (consulta) return consulta;
  consulta = axios
    .get<{ permitido?: boolean }>(`${moduleApiBase()}/payments/simulacion-marca-neutra`, {
      headers: { 'X-Exelixi-Marca': 'neutra' },
      timeout: 8000,
    })
    .then((res) => res.data?.permitido === true)
    .catch(() => {
      consulta = null;
      return false;
    });
  return consulta;
}
