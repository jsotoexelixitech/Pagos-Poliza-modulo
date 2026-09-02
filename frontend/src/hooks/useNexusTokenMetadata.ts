import { useLayoutEffect } from 'react';
import { hydrateCheckoutFromAccessToken } from '../lib/checkout';
import { getSsoMetadataFromBrowser } from '../lib/sso-metadata';
import { useWizardStore } from '../store/wizardStore';

/**
 * Lee metadata del nexus_token (patrón emisión / sso-delegate).
 * Si hay ?sid=, el bridge puede sobrescribir al hidratar; el token sirve de
 * bootstrap cuando la sesión aún no trae checkout.
 * También re-aplica si el token se renueva vía /api/access/verify.
 */
export function useNexusTokenMetadata() {
  useLayoutEffect(() => {
    hydrateCheckoutFromAccessToken();

    const meta = getSsoMetadataFromBrowser();
    if (meta) {
      const store = useWizardStore.getState();
      store.setMetadataCanal({ ...(store.metadataCanal || {}), ...meta });
    }

    const onTokenRefresh = () => {
      hydrateCheckoutFromAccessToken();
      const refreshed = getSsoMetadataFromBrowser();
      if (refreshed) {
        const store = useWizardStore.getState();
        store.setMetadataCanal({ ...(store.metadataCanal || {}), ...refreshed });
      }
    };
    window.addEventListener('nexus-token-refreshed', onTokenRefresh);
    return () => window.removeEventListener('nexus-token-refreshed', onTokenRefresh);
  }, []);
}
