import type {
  CheckoutData,
  CheckoutPayer,
  CheckoutRules,
  PolicyQuote,
  WizardState,
} from '../types';
import { useWizardStore } from '../store/wizardStore';
import { decodeNexusTokenMetadata, getNexusToken } from './nexus-token-client';

const NEXUS_TOKEN_KEY = 'nexus_access_token_pagos';

const SSO_NESTED_KEYS = new Set(['checkout', 'rules', 'payer', 'payload']);

function getAccessTokenFromBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  return getNexusToken(NEXUS_TOKEN_KEY);
}

/** Metadata SSO del JWT (con o sin bridge ?sid=). */
export function readSsoMetadataFromToken(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const token = getAccessTokenFromBrowser();
  if (!token) return null;
  return decodeNexusTokenMetadata(token);
}

/** Metadata SSO sin bridge activo (entrada directa Pagos). */
export function getSsoMetadataFromBrowser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  if (new URLSearchParams(window.location.search).get('sid')) return null;
  return readSsoMetadataFromToken();
}

function extractCanalFields(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!SSO_NESTED_KEYS.has(key)) out[key] = value;
  }
  return out;
}

function mergeCheckoutRules(
  existing: CheckoutRules | null,
  incoming: CheckoutRules | null,
): CheckoutRules | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    onSuccess: { ...existing.onSuccess, ...incoming.onSuccess },
  };
}

/**
 * Fusiona checkout/rules del JWT SSO y de la sesión bridge en el store.
 * - Sin ?sid=: checkout genérico embebido (salta al paso de pago).
 * - Con ?sid=: conserva cotización del wizard; aplica rules/payload del integrador.
 */
export function applySsoCheckoutMetadata(opts?: {
  sessionMeta?: Record<string, unknown> | null;
}): boolean {
  if (typeof window === 'undefined') return false;

  const hasSid = Boolean(new URLSearchParams(window.location.search).get('sid'));
  const store = useWizardStore.getState();

  const sources: Record<string, unknown>[] = [];
  if (opts?.sessionMeta && typeof opts.sessionMeta === 'object') {
    sources.push(opts.sessionMeta);
  }
  const canal = store.metadataCanal;
  if (canal && typeof canal === 'object') sources.push(canal);
  const tokenMeta = readSsoMetadataFromToken();
  if (tokenMeta) sources.push(tokenMeta);

  if (sources.length === 0) return false;

  let rules = store.checkoutRules;
  let payer: CheckoutPayer | null = store.checkoutPayer;
  let payload = store.checkoutPayload;
  let checkout: CheckoutData | null = null;
  let canalFields: Record<string, unknown> = {};

  for (const src of sources) {
    canalFields = { ...canalFields, ...extractCanalFields(src) };
    if (src.rules) {
      rules = mergeCheckoutRules(rules, parseCheckoutRules(src.rules));
    }
    if (src.payer && typeof src.payer === 'object') {
      payer = src.payer as CheckoutPayer;
    }
    if (src.payload && typeof src.payload === 'object') {
      payload = {
        ...(payload ?? {}),
        ...(src.payload as Record<string, unknown>),
      };
    }
    if (isValidCheckoutInput(src.checkout)) checkout = src.checkout;
  }

  if (Object.keys(canalFields).length > 0) {
    store.setMetadataCanal({ ...(store.metadataCanal ?? {}), ...canalFields });
  }

  const standaloneGeneric = !hasSid && checkout !== null;
  let applied = Object.keys(canalFields).length > 0;

  if (checkout && (standaloneGeneric || !store.quote)) {
    store.setCheckout({
      data: checkout,
      rules,
      payer,
      payload,
    });
    store.setQuote(quoteFromCheckout(checkout), 'checkout-metadata');
    store.setQuoteState('ready');
    applied = true;
  } else if (rules || payer || payload) {
    useWizardStore.setState({
      checkoutRules: rules,
      checkoutPayer: payer,
      checkoutPayload: payload,
    });
    applied = true;
  }

  if (standaloneGeneric) {
    store.goTo(5);
  }

  return applied;
}

/** Sesión Pagos standalone con checkout en metadata (antes de hidratar el store). */
export function isStandaloneGenericCheckoutSession(): boolean {
  const meta = getSsoMetadataFromBrowser();
  if (!meta) return false;
  return isValidCheckoutInput(meta.checkout);
}

/** Hidrata checkout desde nexus_token antes del primer render de React. */
export function hydrateCheckoutFromAccessToken(): boolean {
  return applySsoCheckoutMetadata();
}

/** Activo cuando la sesión trae un checkout con monto válido. */
export function hasGenericCheckout(
  state: Pick<WizardState, 'checkout'>,
): boolean {
  const t = state.checkout?.totalVes;
  return typeof t === 'number' && Number.isFinite(t) && t > 0;
}

/** Store hidratado o token SSO con checkout en la URL. */
export function isGenericCheckoutMode(
  state: Pick<WizardState, 'checkout'>,
): boolean {
  return hasGenericCheckout(state) || isStandaloneGenericCheckoutSession();
}

/** Checkout embebido vía metadata SSO (iframe — sin botón Continuar). */
export function isEmbeddedMetadataCheckout(
  state: Pick<WizardState, 'checkout'>,
): boolean {
  if (!isGenericCheckoutMode(state)) return false;
  if (typeof window === 'undefined') return true;
  // Bridge (?sid=) puede usar onSuccess.emit; metadata SSO no controla el flujo del cliente.
  return !new URLSearchParams(window.location.search).get('sid');
}

/** Concepto SyPago / descripción del cobro según el modo activo. */
export function getCheckoutPaymentConcept(
  checkout: CheckoutData | null | undefined,
): string {
  const title = checkout?.title?.trim();
  if (title) return title;
  return 'Pago en línea';
}

function asHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** URL/API del cliente para notificar estado del pago (payload o rules.onSuccess). */
export function getCheckoutNotifyUrl(
  payload: Record<string, unknown> | null | undefined,
  rules?: CheckoutRules | null,
): string | null {
  const sources: Record<string, unknown>[] = [];
  if (payload && typeof payload === 'object') sources.push(payload);
  if (rules?.onSuccess && typeof rules.onSuccess === 'object') {
    sources.push(rules.onSuccess);
  }

  const keys = ['notifyUrl', 'callbackUrl', 'statusUrl', 'webhookUrl'] as const;
  for (const source of sources) {
    for (const key of keys) {
      const url = asHttpUrl(source[key]);
      if (url) return url;
    }
  }
  return null;
}

/** URL a la que volver tras pagar (SSO embebido: payload.successUrl o rules.onSuccess.redirectUrl). */
export function getGenericCheckoutReturnUrl(
  payload: Record<string, unknown> | null | undefined,
  rules?: CheckoutRules | null,
  status: 'success' | 'failed' = 'success',
): string | null {
  const p = payload && typeof payload === 'object' ? payload : {};
  let url: string | null = null;
  if (status === 'failed') {
    url = asHttpUrl(p.cancelUrl) || asHttpUrl(p.failureUrl);
  } else {
    url = asHttpUrl(p.successUrl) || asHttpUrl(rules?.onSuccess?.redirectUrl);
  }
  return url || asHttpUrl(p.returnUrl);
}

function withCheckoutReturnParams(
  url: string,
  status: 'success' | 'failed',
  payload: Record<string, unknown> | null | undefined,
): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.get('status') && !u.searchParams.get('paymentStatus')) {
      u.searchParams.set('status', status === 'success' ? 'ok' : 'error');
    }
    const id = String(payload?.idOperacion || payload?.referenceId || '').trim();
    if (id && !u.searchParams.get('idOperacion') && !u.searchParams.get('referenceId')) {
      u.searchParams.set('idOperacion', id);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Checkout embebido: redirige al portal origen tras pago (respeta autoRedirect / redirectDelayMs). */
export function scheduleGenericCheckoutReturn(params: {
  checkoutPayload: Record<string, unknown> | null;
  checkoutRules: CheckoutRules | null;
  status?: 'success' | 'failed';
}): boolean {
  if (params.checkoutRules?.autoRedirect === false) return false;
  const status = params.status ?? 'success';
  const baseUrl = getGenericCheckoutReturnUrl(
    params.checkoutPayload,
    params.checkoutRules,
    status,
  );
  if (!baseUrl) return false;
  const url = withCheckoutReturnParams(baseUrl, status, params.checkoutPayload);
  const delayRaw = Number(params.checkoutRules?.redirectDelayMs);
  const delay = Number.isFinite(delayRaw) ? Math.max(0, delayRaw) : 2000;
  window.setTimeout(() => {
    window.location.href = url;
  }, delay);
  return true;
}

/** Convierte checkout → quote para reutilizar lógica de montos en Bs. */
export function quoteFromCheckout(checkout: CheckoutData): PolicyQuote {
  return {
    mprima: checkout.totalVes,
    mprimaext: checkout.totalUsd ?? checkout.totalVes,
    ptasa: checkout.exchangeRate ?? 1,
  };
}

export function isValidCheckoutInput(raw: unknown): raw is CheckoutData {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as CheckoutData;
  return (
    typeof c.title === 'string' &&
    c.title.trim().length > 0 &&
    typeof c.totalVes === 'number' &&
    c.totalVes > 0
  );
}

export function parseCheckoutRules(raw: unknown): CheckoutRules | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CheckoutRules;
}

/** Redirige al origen tras pago SSO (rompe iframe si aplica). */
export function redirectCheckoutOnSuccess(rules?: CheckoutRules | null): boolean {
  const raw = rules?.onSuccess?.redirectUrl?.trim();
  if (!raw || rules?.onSuccess?.mode !== 'redirect') return false;

  let redirectUrl = raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('status')) {
      u.searchParams.set('status', 'ok');
    }
    redirectUrl = u.toString();
  } catch {
    redirectUrl = raw.includes('?') ? `${raw}&status=ok` : `${raw}?status=ok`;
  }

  const useTop =
    rules.onSuccess.target === '_top' ||
    (typeof window !== 'undefined' && window.self !== window.top);

  try {
    if (useTop && window.top) {
      window.top.location.href = redirectUrl;
    } else {
      window.location.href = redirectUrl;
    }
    return true;
  } catch {
    window.location.href = redirectUrl;
    return true;
  }
}

/**
 * Avisa al padre (iframe cross-origin) y redirige si aplica.
 * Auto Casa / portales escuchan postMessage con paymentVerified + idOperacion.
 */
export function completeCheckoutOnSuccess(opts: {
  rules?: CheckoutRules | null;
  payload?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  code?: string;
}): void {
  if (typeof window === 'undefined') return;

  const redirectUrl = opts.rules?.onSuccess?.redirectUrl?.trim() || null;
  const idOperacion =
    (opts.payload?.idOperacion as string | undefined) ??
    (opts.payload?.id_operacion as string | undefined) ??
    null;

  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: 'payment.success',
        event: 'payment.success',
        paymentVerified: true,
        status: 'ok',
        code: opts.code ?? 'ACCP',
        idOperacion,
        referenceId: idOperacion,
        redirectUrl,
        payment: opts.payment ?? null,
      },
      '*',
    );
  }

  redirectCheckoutOnSuccess(opts.rules);
}

/** ¿Exige pago verificado antes de continuar? */
export function requiresPaymentBeforeContinue(
  state: Pick<WizardState, 'checkout' | 'checkoutRules'>,
  funeralFlow: boolean,
): boolean {
  if (hasGenericCheckout(state)) {
    return state.checkoutRules?.requirePayment !== false;
  }
  return !funeralFlow;
}

/**
 * QA temporal: simula verificación de pago móvil (sin Meritop/Banco Activo).
 * Activar con VITE_SKIP_PAYMENT_VERIFY=true en el build de pagos-web.
 * La póliza emite con paymentVerified=true y referencia SIM-* (recibo activado).
 */
export function isPaymentBypassEnabled(): boolean {
  return import.meta.env.VITE_SKIP_PAYMENT_VERIFY === 'true';
}

/** Pago móvil simulado (Exélixi piloto o bypass QA RCV/funerario). */
export function isMobilePaymentSimulated(): boolean {
  return isPaymentBypassEnabled();
}
