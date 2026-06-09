import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'

import { PagosConfigPanel } from './config/PagosConfigPanel'

const isConfigRoute = window.location.pathname === '/config';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute ? (
      <PagosConfigPanel />
    ) : (
      <NexusGuard recheckInterval={30}>
        <App />
      </NexusGuard>
    )}
  </StrictMode>,
)
