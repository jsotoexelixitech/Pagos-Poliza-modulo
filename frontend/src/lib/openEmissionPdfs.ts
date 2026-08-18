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

/** Cola compartida con doc-opener.html (localStorage — compartido entre pestañas mismo origen). */
export const PAGOS_EMISSION_DOCS_KEY = 'pagos_emission_docs_pending';

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

function docOpenerPageUrl(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${window.location.origin}${base}doc-opener.html`;
}

/** Sincronico al confirmar pago: abre pestaña auxiliar que hara polling a localStorage. */
export function prepareEmissionDocOpener(): void {
  localStorage.removeItem(PAGOS_EMISSION_DOCS_KEY);
  window.open(docOpenerPageUrl(), 'exelixi_emission_docs');
}

export function queueEmissionDocs(urls: string[]): void {
  if (urls.length === 0) {
    localStorage.removeItem(PAGOS_EMISSION_DOCS_KEY);
    return;
  }
  localStorage.setItem(PAGOS_EMISSION_DOCS_KEY, JSON.stringify(urls));
}

/**
 * Patrón SysIP pay-form.component.ts: window.open(url, '_blank') por cada documento.
 * Tras await de emisión (mismo handler async que inició con clic del usuario).
 */
function openUrlsLikeLaMundial(urls: string[]): string[] {
  const opened: string[] = [];
  for (const url of urls) {
    try {
      const tab = window.open(url, '_blank', 'noopener,noreferrer');
      if (tab) {
        opened.push(url);
        continue;
      }
    } catch {
      /* fallback */
    }
    try {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      opened.push(url);
    } catch {
      /* blocked */
    }
  }
  return opened;
}

export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  if (urls.length === 0) {
    localStorage.removeItem(PAGOS_EMISSION_DOCS_KEY);
    return { opened: [], total: 0, blockedCount: 0 };
  }

  queueEmissionDocs(urls);
  const opened = openUrlsLikeLaMundial(urls);

  return {
    opened,
    total: urls.length,
    blockedCount: Math.max(0, urls.length - opened.length),
  };
}

/** Clic explícito del usuario en pantalla de éxito. */
export function openEmissionPdfsOnUserClick(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  const opened = openUrlsLikeLaMundial(urls);
  return { opened, total: urls.length, blockedCount: Math.max(0, urls.length - opened.length) };
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.blockedCount > 0) {
    return ' · Si faltan PDFs, usa los enlaces en pantalla';
  }
  if (result.total === 1) return ' · Documento abierto en nueva pestaña';
  return ` · ${result.total} documentos abiertos en nuevas pestañas`;
}

/** Tras emisión: encola URLs (doc-opener) + window.open secuencial como La Mundial. */
export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  return openEmissionPdfs(docs);
}
