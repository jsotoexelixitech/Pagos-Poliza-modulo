import type {
  CheckoutData,
  CheckoutRules,
  PolicyQuote,
  WizardState,
} from '../types';
import { useWizardStore } from '../store/wizardStore';
import { effectiveCanalVisibility } from './canal-visibility';
import { getSsoMetadataFromBrowser } from './sso-metadata';

export { getSsoMetadataFromBrowser } from './sso-metadata';

/** Sesión Pagos standalone con checkout en metadata (antes de hidratar el store). */
export function isStandaloneGenericCheckoutSession(): boolean {
  const meta = getSsoMetadataFromBrowser();
  if (!meta) return false;
  return isValidCheckoutInput(meta.checkout);
}

/**
 * Hidrata checkout desde nexus_token antes del primer render de React.
 * Si ya hay checkout en el store (p. ej. bridge hidrató la sesión), no pisa.
 */
export function hydrateCheckoutFromAccessToken(): boolean {
  const meta = getSsoMetadataFromBrowser();
  if (!meta) return false;

  const { checkout, rules, payer, payload: opaque, ...canal } = meta;
  const store = useWizardStore.getState();

  if (Object.keys(canal).length > 0) {
    store.setMetadataCanal({ ...(store.metadataCanal || {}), ...canal });
  }

  if (!isValidCheckoutInput(checkout)) return false;

  // Bridge (?sid=) puede llegar después y sobrescribir; no pisar si ya hay checkout.
  if (hasGenericCheckout(store)) return true;

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

/**
 * Hidrata checkout desde query params (SysIP o integración vía iframe/URL).
 * Soporta: embed, amount/totalVes, totalUsd, docType, docNumber/cedula, phone/telefono, name/nombre, title/plan, etc.
 */
export function hydrateCheckoutFromQueryParams(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);

  const rawVes = params.get('amount') || params.get('totalVes') || params.get('monto') || params.get('ves');
  if (!rawVes) return false;

  const totalVes = parseFloat(rawVes.replace(',', '.'));
  if (!Number.isFinite(totalVes) || totalVes <= 0) return false;

  const rawUsd = params.get('totalUsd') || params.get('usd') || params.get('dolares');
  const parsedUsd = rawUsd ? parseFloat(rawUsd.replace(',', '.')) : NaN;
  const totalUsd = Number.isFinite(parsedUsd) && parsedUsd > 0 ? parsedUsd : undefined;

  const rawRate = params.get('exchangeRate') || params.get('tasa');
  const parsedRate = rawRate ? parseFloat(rawRate.replace(',', '.')) : NaN;
  const exchangeRate = Number.isFinite(parsedRate) && parsedRate > 0
    ? parsedRate
    : (totalUsd && totalUsd > 0 ? totalVes / totalUsd : undefined);

  let docType = (params.get('docType') || params.get('tipoDoc') || params.get('icedula') || '').toUpperCase().trim();
  let docNumber = (params.get('docNumber') || params.get('cedula') || params.get('cci_rif') || params.get('identificacion') || '').trim();

  // Si docNumber viene con letra prefijo tipo V12345678 o V-12345678
  if (!docType && docNumber) {
    const match = docNumber.match(/^([VEJPGvejpg])[- ]?(\d+)$/);
    if (match) {
      docType = match[1].toUpperCase();
      docNumber = match[2];
    }
  } else if (docType && docNumber) {
    docNumber = docNumber.replace(/^[VEJPGvejpg][- ]?/, '');
  }

  const phone = params.get('phone') || params.get('telefono') || params.get('xtelefono') || '';
  const name = params.get('name') || params.get('nombre') || params.get('xcliente') || '';
  const email = params.get('email') || params.get('correo') || '';
  const title = params.get('title') || params.get('titulo') || params.get('plan') || params.get('concepto') || 'Pago de Póliza';
  const referenceId = params.get('referenceId') || params.get('idOperacion') || params.get('cnpoliza') || undefined;

  // Datos del asegurado (si es diferente al tomador)
  let asegDocType = (params.get('asegDocType') || params.get('asegTipoDoc') || params.get('asegIcedula') || '').toUpperCase().trim();
  let asegDocNumber = (params.get('asegDocNumber') || params.get('asegCedula') || params.get('asegCci_rif') || params.get('asegIdentificacion') || '').trim();

  if (!asegDocType && asegDocNumber) {
    const match = asegDocNumber.match(/^([VEJPGvejpg])[- ]?(\d+)$/);
    if (match) {
      asegDocType = match[1].toUpperCase();
      asegDocNumber = match[2];
    }
  } else if (asegDocType && asegDocNumber) {
    asegDocNumber = asegDocNumber.replace(/^[VEJPGvejpg][- ]?/, '');
  }

  const asegPhone = params.get('asegPhone') || params.get('asegTelefono') || params.get('asegXtelefono') || '';
  const asegName = params.get('asegName') || params.get('asegNombre') || params.get('asegCliente') || '';
  const asegEmail = params.get('asegEmail') || params.get('asegCorreo') || '';

  const store = useWizardStore.getState();
  if (hasGenericCheckout(store)) return true;

  const checkout: CheckoutData = {
    title,
    subtitle: referenceId ? `Referencia: ${referenceId}` : undefined,
    referenceId,
    totalVes,
    totalUsd,
    exchangeRate,
    lines: [
      {
        label: title,
        amountVes: totalVes,
        amountUsd: totalUsd,
      },
    ],
  };

  const payer = {
    documentType: docType || undefined,
    documentNumber: docNumber || undefined,
    phone: phone || undefined,
    name: name || undefined,
    email: email || undefined,
  };

  const tomadorPayload = {
    documentType: docType || undefined,
    documentNumber: docNumber || undefined,
    phone: phone || undefined,
    name: name || undefined,
    email: email || undefined,
  };

  const aseguradoPayload = {
    documentType: asegDocType || undefined,
    documentNumber: asegDocNumber || undefined,
    phone: asegPhone || undefined,
    name: asegName || undefined,
    email: asegEmail || undefined,
  };

  store.setCheckout({
    data: checkout,
    rules: {
      requirePayment: true,
      autoRedirect: false,
    },
    payer: Object.values(payer).some(Boolean) ? payer : null,
    payload: {
      idOperacion: referenceId,
      source: 'sysip',
      tomador: tomadorPayload,
      asegurado: aseguradoPayload,
    },
  });

  if (docNumber || phone || name || email) {
    store.setTomador({
      tipoDoc: (docType as 'V' | 'E' | 'J' | 'G' | 'P') || 'V',
      identificacion: docNumber,
      nombre: name,
      telefono: phone,
      email,
    });
  }

  if (asegDocNumber || asegPhone || asegName) {
    store.setAsegurado({
      tipoDoc: (asegDocType as 'V' | 'E' | 'J' | 'G' | 'P') || (docType as 'V' | 'E' | 'J' | 'G' | 'P') || 'V',
      identificacion: asegDocNumber,
      nombre: asegName,
      telefono: asegPhone,
      email: asegEmail,
    });
    store.setSameInsured(false);
  }

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
  if (hasGenericCheckout(state) || isStandaloneGenericCheckoutSession()) return true;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const rawVes = params.get('amount') || params.get('totalVes') || params.get('monto') || params.get('ves');
    if (rawVes && parseFloat(rawVes.replace(',', '.')) > 0) return true;
  }
  return false;
}

/** Checkout embebido vía metadata SSO o query params (iframe — sin botón Continuar). */
export function isEmbeddedMetadataCheckout(
  state: Pick<WizardState, 'checkout'>,
): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === 'true' || params.get('embedded') === 'true') {
      return true;
    }
    if (window.parent !== window && hasGenericCheckout(state)) {
      return true;
    }
  }
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

/** URL a la que volver tras pagar (Hogar/Condominio SSO: payload.successUrl). */
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
  // payload.returnUrl es el fallback general, independiente del estado
  return url || asHttpUrl(p.returnUrl);
}

/** Añade status / idOperacion al return URL si el portal no los trae. */
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
    const id = String(
      payload?.idOperacion || payload?.referenceId || '',
    ).trim();
    if (id && !u.searchParams.get('idOperacion') && !u.searchParams.get('referenceId')) {
      u.searchParams.set('idOperacion', id);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Checkout embebido (Hogar/Condominio): no hay botón Continuar.
 * Tras autorizar pago o domiciliación, vuelve al portal origen.
 */
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

/** ¿Exige pago verificado antes de continuar? */
export function requiresPaymentBeforeContinue(
  state: Pick<WizardState, 'checkout' | 'checkoutRules' | 'canalVisibility' | 'metadataCanal'>,
  funeralFlow: boolean,
): boolean {
  const canal = effectiveCanalVisibility(state.canalVisibility, state.metadataCanal);
  const canalRequired = canal?.ui
    ? canal.ui.mostrarPasoPago
      && canal.ui.requierePagoVerificado
    : null;

  if (canalRequired === false) return false;
  if (canalRequired === true) return true;

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
