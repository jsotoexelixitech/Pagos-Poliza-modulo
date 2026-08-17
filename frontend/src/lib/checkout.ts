import type {
  CheckoutData,
  CheckoutRules,
  PolicyQuote,
  WizardState,
} from '../types';
import { useWizardStore } from '../store/wizardStore';

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payloadStr = atob(
      payloadBase64.replace(/-/g, '+').replace(/_/g, '/'),
    );
    return JSON.parse(payloadStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAccessTokenFromBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem('nexus_access_token_pagos') ||
    sessionStorage.getItem('nexus_access_token') ||
    new URLSearchParams(window.location.search).get('nexus_token')
  );
}

/** Metadata SSO del token en URL/storage (sin bridge ?sid=). */
export function getSsoMetadataFromBrowser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  if (new URLSearchParams(window.location.search).get('sid')) return null;

  const token = getAccessTokenFromBrowser();
  if (!token) return null;

  const payload = decodeTokenPayload(token);
  const meta = payload?.metadata;
  return meta && typeof meta === 'object'
    ? (meta as Record<string, unknown>)
    : null;
}

/** Sesión Pagos standalone con checkout en metadata (antes de hidratar el store). */
export function isStandaloneGenericCheckoutSession(): boolean {
  const meta = getSsoMetadataFromBrowser();
  if (!meta) return false;
  return isValidCheckoutInput(meta.checkout);
}

/** Hidrata checkout desde nexus_token antes del primer render de React. */
export function hydrateCheckoutFromAccessToken(): boolean {
  const meta = getSsoMetadataFromBrowser();
  if (!meta) return false;

  const { checkout, rules, payer, payload: opaque, ...canal } = meta;
  const store = useWizardStore.getState();

  if (Object.keys(canal).length > 0) {
    store.setMetadataCanal(canal);
  }

  if (!isValidCheckoutInput(checkout)) return false;

  store.setCheckout({
    data: checkout,
    rules: parseCheckoutRules(rules),
    payer: payer && typeof payer === 'object' ? (payer as never) : null,
    payload:
      opaque && typeof opaque === 'object'
        ? (opaque as Record<string, unknown>)
        : null,
  });
  store.setQuote(quoteFromCheckout(checkout), 'checkout-metadata');
  store.setQuoteState('ready');
  store.goTo(5);
  return true;
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
      const value = source[key];
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
        return value.trim();
      }
    }
  }
  return null;
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
