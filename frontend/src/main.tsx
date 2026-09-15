import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { hydrateCheckoutFromAccessToken } from './lib/checkout'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiWizardHandoff } from './lib/exelixi-catalog'
import { applyExelixiBranding } from './lib/exelixi-branding'
import {
  applyTarjetaFarmaciaPaymentSkip,
  hydrateTarjetaHandoff,
  hydrateTarjetaMetadataCanal,
  isTarjetaRcvFlow,
  markTarjetaPublicSession,
} from './lib/rcv-tarjeta-flow'
import { useWizardStore } from './store/wizardStore'

import { PagosConfigPanel } from './config/PagosConfigPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Pagos');

if (isTarjetaRcvFlow()) {
  markTarjetaPublicSession();
  hydrateTarjetaHandoff();
  hydrateTarjetaMetadataCanal();
  applyTarjetaFarmaciaPaymentSkip();
}

hydrateCheckoutFromAccessToken();

function ExelixiHandoffBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { goTo } = useWizardStore.getState();
    const setState = (partial: Record<string, unknown>) => {
      (useWizardStore as unknown as { setState: (p: Record<string, unknown>) => void }).setState(partial);
    };
    applyExelixiWizardHandoff(setState, goTo);
    applyTarjetaFarmaciaPaymentSkip();
  }, []);
  return children;
}

// /config (dev) o /pagos/config (prod con prefijo Apache)
const isConfigRoute = /\/config\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <PagosConfigPanel />
    ) : (
      <NexusGuard recheckInterval={30}>
        <ExelixiHandoffBootstrap>
          <App />
        </ExelixiHandoffBootstrap>
      </NexusGuard>
    )}
  </StrictMode>,
)
