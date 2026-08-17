import { useLayoutEffect } from 'react';
import { hydrateCheckoutFromAccessToken } from '../lib/checkout';

/**
 * Lee metadata del nexus_token (patrón emisión / sso-delegate).
 * Prioridad: sid (bridge) > metadata del token.
 * También re-aplica si el token se renueva vía /api/access/verify.
 */
export function useNexusTokenMetadata() {
  useLayoutEffect(() => {
    hydrateCheckoutFromAccessToken();

    const onTokenRefresh = () => hydrateCheckoutFromAccessToken();
    window.addEventListener('nexus-token-refreshed', onTokenRefresh);
    return () => window.removeEventListener('nexus-token-refreshed', onTokenRefresh);
  }, []);
}
