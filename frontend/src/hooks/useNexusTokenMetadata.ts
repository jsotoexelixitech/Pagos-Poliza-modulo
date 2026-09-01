import { useLayoutEffect } from 'react';
import { applySsoCheckoutMetadata } from '../lib/checkout';

/**
 * Fusiona metadata SSO (rules, checkout, canal) con el store.
 * Con ?sid= el bridge hidrata la sesión; el token sigue como bootstrap.
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
