function decodeJwtBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  try {
    const bytes = Uint8Array.from(binary, (m) => m.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return decodeURIComponent(
        binary
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
    } catch {
      return binary;
    }
  }
}

/** Metadata SSO embebida en el JWT tenant_access (sso-delegate / bridge). */
export function getSsoMetadataFromBrowser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;

  const getParam = (key: string) => {
    try {
      const fromSearch = new URLSearchParams(window.location.search).get(key);
      if (fromSearch) return fromSearch;
      const hash = window.location.hash || '';
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1) {
        return new URLSearchParams(hash.slice(qIdx)).get(key);
      }
    } catch { /* ignore */ }
    return null;
  };

  const tokenFromUrl = getParam('nexus_token');
  const token =
    tokenFromUrl
    || sessionStorage.getItem('nexus_access_token_pagos')
    || sessionStorage.getItem('nexus_access_token');

  if (!token) return null;

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payloadStr = decodeJwtBase64Utf8(payloadBase64);
    const payload = JSON.parse(payloadStr) as { metadata?: unknown };
    const meta = payload?.metadata;
    return meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
