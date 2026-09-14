import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { hydrateCheckoutFromAccessToken, hydrateCheckoutFromQueryParams } from './lib/checkout'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiWizardHandoff } from './lib/exelixi-catalog'
import { applyExelixiBranding } from './lib/exelixi-branding'
import { useWizardStore } from './store/wizardStore'

import { PagosConfigPanel } from './config/PagosConfigPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Pagos');

hydrateCheckoutFromAccessToken() || hydrateCheckoutFromQueryParams();

function ExelixiHandoffBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { goTo } = useWizardStore.getState();
    const setState = (partial: Record<string, unknown>) => {
      (useWizardStore as unknown as { setState: (p: Record<string, unknown>) => void }).setState(partial);
    };
    applyExelixiWizardHandoff(setState, goTo);
  }, []);
  return children;
}

// /config (dev) o /pagos/config (prod con prefijo Apache)
const isConfigRoute = /\/config\/?$/.test(window.location.pathname);

const isEmbedMode = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('embed') === 'true' ||
  new URLSearchParams(window.location.search).get('embedded') === 'true' ||
  (window.parent !== window && Boolean(new URLSearchParams(window.location.search).get('amount')))
);

const appTree = (
  <ExelixiHandoffBootstrap>
    <App />
  </ExelixiHandoffBootstrap>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <PagosConfigPanel />
    ) : import.meta.env.DEV || isEmbedMode ? (
      // En DEV o en modo embebido (iframe SysIP) se omite NexusGuard
      appTree
    ) : (
      <NexusGuard recheckInterval={30}>{appTree}</NexusGuard>
    )}
  </StrictMode>,
)
