import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { hydrateCheckoutFromAccessToken } from './lib/checkout'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiWizardHandoff } from './lib/exelixi-catalog'
import { useWizardStore } from './store/wizardStore'

import { PagosConfigPanel } from './config/PagosConfigPanel'

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

const isConfigRoute = window.location.pathname === '/config';

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
