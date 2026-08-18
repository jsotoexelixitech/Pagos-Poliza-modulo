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

/**
 * Patrón SysIP pay-form.component.ts: window.open(url, '_blank') por cada documento
 * en el mismo handler async que empezó con el clic del usuario.
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

function openAndReport(urls: string[]): OpenEmissionResult {
  const opened = openUrlsLikeLaMundial(urls);
  return {
    opened,
    total: urls.length,
    blockedCount: Math.max(0, urls.length - opened.length),
  };
}

export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  return openAndReport(collectEmissionUrls(docs));
}

export function openEmissionPdfsOnUserClick(docs: EmissionPdfDocs): OpenEmissionResult {
  return openAndReport(collectEmissionUrls(docs));
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.blockedCount > 0) {
    return ' · Si faltan PDFs, usa los enlaces en pantalla';
  }
  if (result.total === 1) return ' · Documento abierto en nueva pestaña';
  return ` · ${result.total} documentos abiertos en nuevas pestañas`;
}

export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  return openEmissionPdfs(docs);
}
