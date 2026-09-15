import type { WizardState } from '../types';

/** Pago funerario tras aprobación técnica — datos congelados, solo checkout. */
export function isFuneralApprovedCheckout(
  state: Pick<
    WizardState,
    'funeralApprovedCheckout' | 'checkoutRules' | 'product'
  >,
): boolean {
  if (state.funeralApprovedCheckout === true) return true;
  if (state.checkoutRules?.lockFields && state.product === 'funerario') return true;
  return false;
}

export function isFuneralPaymentLinkExpired(
  expiresAtIso: string | undefined | null,
): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
}
