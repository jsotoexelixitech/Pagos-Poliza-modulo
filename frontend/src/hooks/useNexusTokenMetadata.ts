import { useLayoutEffect } from 'react';
import { applySsoCheckoutMetadata } from '../lib/checkout';

/**
 * Fusiona metadata SSO (rules, checkout, canal) con el store.
 * Funciona con bridge (?sid=) y con entrada directa a Pagos.
 * Re-aplica si el token se renueva vía /api/access/verify.
 */
export function useNexusTokenMetadata() {
  useLayoutEffect(() => {
    applySsoCheckoutMetadata();

    const onTokenRefresh = () => applySsoCheckoutMetadata();
    window.addEventListener('nexus-token-refreshed', onTokenRefresh);
    return () => window.removeEventListener('nexus-token-refreshed', onTokenRefresh);
  }, []);
}
