export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

export type EmissionDocItem = {
  key: string;
  label: string;
  url: string;
};

export type OpenEmissionResult = {
  opened: string[];
  total: number;
  blockedCount: number;
};

/** Tras emisión: mostrar prompt en pantalla de éxito para abrir PDFs con clic del usuario. */
export const PAGOS_PROMPT_OPEN_DOCS_KEY = 'pagos_prompt_open_docs';

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return listEmissionDocs(docs).map((d) => d.url);
}

export function listEmissionDocs(docs: EmissionPdfDocs): EmissionDocItem[] {
  const items: EmissionDocItem[] = [];
  if (docs.urlpoliza?.trim()) {
    items.push({ key: 'poliza', label: 'Cuadro de póliza', url: docs.urlpoliza.trim() });
  }
  if (docs.url_conductor_habitual?.trim()) {
    items.push({
      key: 'conductor',
      label: 'Anexo conductor habitual',
      url: docs.url_conductor_habitual.trim(),
    });
  }
  if (docs.url_club_arys?.trim()) {
    items.push({ key: 'arys', label: 'Club Arys', url: docs.url_club_arys.trim() });
  }
  if (docs.url_ingreso_caja?.trim()) {
    items.push({ key: 'ingreso', label: 'Ingreso de caja', url: docs.url_ingreso_caja.trim() });
  }
  return items;
}

export function countEmissionDocs(docs: EmissionPdfDocs): number {
  return listEmissionDocs(docs).length;
}

/** form GET + target=_blank — permite varias pestañas en un mismo clic de usuario. */
function openUrlViaForm(url: string): void {
  const form = document.createElement('form');
  form.method = 'GET';
  form.action = url;
  form.target = '_blank';
  form.style.display = 'none';
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

/**
 * Abre URLs en pestañas nuevas. Llamar dentro del handler de un clic del usuario.
 */
export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  const opened: string[] = [];

  for (const url of urls) {
    openUrlViaForm(url);
    opened.push(url);
  }

  return {
    opened,
    total: urls.length,
    blockedCount: 0,
  };
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.total === 1) return ' · Pulsa «Abrir documento» para ver el PDF';
  return ` · Pulsa «Abrir ${result.total} documentos» para ver los PDFs`;
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

/** Tras emisión async: marca prompt (el navegador no abre popups sin clic). */
export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  markPromptOpenDocsAfterEmission(docs);
  return { opened: [], total: countEmissionDocs(docs), blockedCount: countEmissionDocs(docs) };
}
