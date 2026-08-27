import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { hydrateCheckoutFromAccessToken } from './lib/checkout'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiWizardHandoff } from './lib/exelixi-catalog'
import { applyExelixiBranding } from './lib/exelixi-branding'
import { useWizardStore } from './store/wizardStore'

import { PagosConfigPanel } from './config/PagosConfigPanel'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('Pagos');

hydrateCheckoutFromAccessToken();

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

const appTree = (
  <ExelixiHandoffBootstrap>
    <App />
  </ExelixiHandoffBootstrap>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <PagosConfigPanel />
    ) : import.meta.env.DEV ? (
      // En DEV se omite NexusGuard para agilizar el desarrollo local sin SSO.
      // El token Nexus no se valida en el servidor si NEXUS_AUTH_ENABLED=false (.env).
      // Si necesitas probar el flujo de auth completo, pon VITE_FORCE_NEXUS_GUARD=true
      // en .env.local y condicion: !import.meta.env.DEV || import.meta.env.VITE_FORCE_NEXUS_GUARD
      appTree
    ) : (
      <NexusGuard recheckInterval={30}>{appTree}</NexusGuard>
    )}
  </StrictMode>,
)
