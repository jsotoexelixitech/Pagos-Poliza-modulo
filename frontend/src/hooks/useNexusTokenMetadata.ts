import { useLayoutEffect } from 'react';
import { hydrateCheckoutFromAccessToken } from '../lib/checkout';

/**
 * Lee metadata del nexus_token (patrón emisión / sso-delegate).
 * Si hay ?sid=, el bridge puede sobrescribir al hidratar; el token sirve de
 * bootstrap cuando la sesión aún no trae checkout.
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
