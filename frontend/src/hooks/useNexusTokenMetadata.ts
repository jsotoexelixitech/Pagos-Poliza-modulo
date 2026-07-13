import { useEffect } from 'react';
import { useWizardStore } from '../store/wizardStore';
import {
  isValidCheckoutInput,
  parseCheckoutRules,
  quoteFromCheckout,
} from '../lib/checkout';

/**
 * Lee metadata del nexus_token (patrón emisión / sso-delegate).
 * Prioridad: sid (bridge) > metadata del token.
 * También re-aplica si el token se renueva vía /api/access/verify.
 */
export function useNexusTokenMetadata() {
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);
  const setCheckout = useWizardStore((s) => s.setCheckout);
  const setQuote = useWizardStore((s) => s.setQuote);
  const setQuoteState = useWizardStore((s) => s.setQuoteState);

  useEffect(() => {
    const applyFromToken = () => {
      try {
        if (new URLSearchParams(window.location.search).get('sid')) return;

        const token =
          new URLSearchParams(window.location.search).get('nexus_token') ||
          sessionStorage.getItem('nexus_access_token_pagos') ||
          sessionStorage.getItem('nexus_access_token');
        if (!token) return;

        const payloadBase64 = token.split('.')[1];
        if (!payloadBase64) return;

        const payloadStr = atob(
          payloadBase64.replace(/-/g, '+').replace(/_/g, '/'),
        );
        const payload = JSON.parse(payloadStr) as {
          metadata?: Record<string, unknown>;
        };

        const meta = payload.metadata;
        if (!meta || typeof meta !== 'object') return;

        const { checkout, rules, payer, payload: opaque, ...canal } = meta;

        if (Object.keys(canal).length > 0) {
          setMetadataCanal(canal);
        }

        if (isValidCheckoutInput(checkout)) {
          setCheckout({
            data: checkout,
            rules: parseCheckoutRules(rules),
            payer:
              payer && typeof payer === 'object' ? (payer as never) : null,
            payload:
              opaque && typeof opaque === 'object'
                ? (opaque as Record<string, unknown>)
                : null,
          });
          setQuote(quoteFromCheckout(checkout), 'checkout-metadata');
          setQuoteState('ready');
        }
      } catch {
        // Token inválido — no bloquea flujo RCV/funerario
      }
    };

    applyFromToken();

    const onTokenRefresh = () => applyFromToken();
    window.addEventListener('nexus-token-refreshed', onTokenRefresh);
    return () => window.removeEventListener('nexus-token-refreshed', onTokenRefresh);
  }, [setMetadataCanal, setCheckout, setQuote, setQuoteState]);
}
