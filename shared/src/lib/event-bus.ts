/**
 * Event Bus — comunicacion entre modulos sin acoplamiento.
 *
 * Cuando dos o mas modulos viven en la misma pagina (host) pueden enviar
 * mensajes entre si sin conocerse, usando un bus centralizado. El bus usa
 * dos transportes:
 *
 *   1. CustomEvent en `window`           (mismo documento, sincrono)
 *   2. BroadcastChannel("exelixi-bus")   (entre tabs/iframes del mismo origen)
 *
 * Cuando un modulo corre solo (sin otros modulos en la pagina) el bus
 * sigue funcionando: simplemente nadie escucha y los eventos se ignoran.
 */

import type { ModuleMessage, ModuleMessageType } from './protocol';

const CHANNEL_NAME = 'exelixi-bus';
const WINDOW_EVENT = 'exelixi:message';

let bc: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!('BroadcastChannel' in window)) return null;
  if (bc) return bc;
  try { bc = new BroadcastChannel(CHANNEL_NAME); } catch { bc = null; }
  return bc;
}

/**
 * Publica un mensaje en el bus. Llega a TODOS los suscriptores del mismo
 * documento (window) y a los de otros tabs/iframes via BroadcastChannel.
 */
export function publish(msg: ModuleMessage): void {
  if (typeof window === 'undefined') return;
  const enriched: ModuleMessage = { ...msg, timestamp: msg.timestamp || new Date().toISOString() };
  window.dispatchEvent(new CustomEvent(WINDOW_EVENT, { detail: enriched }));
  const ch = getBroadcastChannel();
  if (ch) { try { ch.postMessage(enriched); } catch { /* payload no serializable */ } }
}

/** Subscribe — devuelve una funcion para desuscribirse. */
export function subscribe<T extends ModuleMessageType | '*'>(
  type: T,
  handler: (msg: ModuleMessage) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onWindow = (e: Event) => {
    const ce = e as CustomEvent<ModuleMessage>;
    if (!ce.detail) return;
    if (type === '*' || ce.detail.type === type) handler(ce.detail);
  };
  const onBroadcast = (e: MessageEvent) => {
    const data = e.data as ModuleMessage;
    if (!data || !data.type) return;
    if (type === '*' || data.type === type) handler(data);
  };

  window.addEventListener(WINDOW_EVENT, onWindow);
  const ch = getBroadcastChannel();
  ch?.addEventListener('message', onBroadcast);

  return () => {
    window.removeEventListener(WINDOW_EVENT, onWindow);
    ch?.removeEventListener('message', onBroadcast);
  };
}

/** Espera la proxima aparicion de un mensaje del tipo dado. */
export function waitFor<T extends ModuleMessageType>(
  type: T,
  timeoutMs = 30000,
): Promise<ModuleMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`Timeout esperando "${type}" (${timeoutMs}ms)`)); }, timeoutMs);
    const off = subscribe(type, (msg) => { clearTimeout(timer); off(); resolve(msg); });
  });
}
