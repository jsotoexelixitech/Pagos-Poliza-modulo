import type {
  CheckoutData,
  CheckoutRules,
  PolicyQuote,
  WizardState,
} from '../types';

/** Activo cuando la sesión trae un checkout con monto válido. */
export function hasGenericCheckout(
  state: Pick<WizardState, 'checkout'>,
): boolean {
  const t = state.checkout?.totalVes;
  return typeof t === 'number' && Number.isFinite(t) && t > 0;
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
