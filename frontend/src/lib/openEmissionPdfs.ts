export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

export type OpenEmissionResult = {
  opened: string[];
  total: number;
  blockedCount: number;
};

/** Tras emisión: mostrar prompt en pantalla de éxito si el navegador bloqueó popups. */
export const PAGOS_PROMPT_OPEN_DOCS_KEY = 'pagos_prompt_open_docs';

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));
}

export function countEmissionDocs(docs: EmissionPdfDocs): number {
  return collectEmissionUrls(docs).length;
}

/**
 * Abre URLs en pestañas nuevas. Debe llamarse dentro de un clic del usuario
 * para evitar bloqueo del navegador; si se llama tras await puede fallar.
 */
export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  const opened: string[] = [];

  for (const url of urls) {
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) continue;

    try {
      tab.opener = null;
    } catch {
      // ignore
    }
    opened.push(url);
  }

  return {
    opened,
    total: urls.length,
    blockedCount: Math.max(0, urls.length - opened.length),
  };
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.opened.length === result.total) {
    if (result.opened.length === 1) return ' · PDF abierto en nueva pestaña';
    return ` · ${result.opened.length} documentos abiertos en nuevas pestañas`;
  }
  if (result.opened.length > 0) {
    return ` · ${result.opened.length} de ${result.total} documentos abiertos`;
  }
  return ' · Pulsa «Abrir documentos» para ver los PDFs';
}

export function markPromptOpenDocsAfterEmission(docs: EmissionPdfDocs): void {
  if (countEmissionDocs(docs) > 0) {
    sessionStorage.setItem(PAGOS_PROMPT_OPEN_DOCS_KEY, '1');
  }
}

export function consumePromptOpenDocsFlag(): boolean {
  const pending = sessionStorage.getItem(PAGOS_PROMPT_OPEN_DOCS_KEY) === '1';
  if (pending) sessionStorage.removeItem(PAGOS_PROMPT_OPEN_DOCS_KEY);
  return pending;
}

/** Tras emisión exitosa: intenta abrir PDFs y marca prompt si el navegador bloqueó. */
export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  const result = openEmissionPdfs(docs);
  markPromptOpenDocsAfterEmission(docs);
  return result;
}
