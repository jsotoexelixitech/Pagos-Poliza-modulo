/** Metadata SSO embebida en el JWT tenant_access (sso-delegate / bridge). */
export function getSsoMetadataFromBrowser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;

  const token =
    sessionStorage.getItem('nexus_access_token_pagos')
    || sessionStorage.getItem('nexus_access_token')
    || new URLSearchParams(window.location.search).get('nexus_token');

  if (!token) return null;

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payloadStr = atob(
      payloadBase64.replace(/-/g, '+').replace(/_/g, '/'),
    );
    const payload = JSON.parse(payloadStr) as { metadata?: unknown };
    const meta = payload?.metadata;
    return meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
