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

/** Pestañas reservadas en el clic de pago (antes del await) para evitar bloqueo de popups. */
let reservedPdfTabs: Window[] = [];

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

/** Llamar de forma síncrona en el handler del clic (Confirmar pago / Verificar) antes de cualquier await. */
export function reserveEmissionPdfTabs(maxCount = 4): void {
  discardReservedPdfTabs();
  for (let i = 0; i < maxCount; i += 1) {
    const tab = window.open('about:blank', '_blank');
    if (tab) reservedPdfTabs.push(tab);
  }
}

export function discardReservedPdfTabs(): void {
  for (const tab of reservedPdfTabs) {
    try {
      if (tab && !tab.closed) tab.close();
    } catch {
      /* ignore */
    }
  }
  reservedPdfTabs = [];
}

/** form GET + target=_blank — fallback si no hay pestaña reservada. */
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
 * Navega pestañas reservadas o abre vía form. Tras emisión async.
 */
export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  const opened: string[] = [];
  let blockedCount = 0;
  const tabs = reservedPdfTabs;
  reservedPdfTabs = [];

  urls.forEach((url, index) => {
    const tab = tabs[index];
    if (tab && !tab.closed) {
      try {
        tab.location.href = url;
        opened.push(url);
        return;
      } catch {
        /* fallback */
      }
    }
    try {
      openUrlViaForm(url);
      opened.push(url);
    } catch {
      blockedCount += 1;
    }
  });

  for (let i = urls.length; i < tabs.length; i += 1) {
    try {
      if (tabs[i] && !tabs[i].closed) tabs[i].close();
    } catch {
      /* ignore */
    }
  }

  return {
    opened,
    total: urls.length,
    blockedCount,
  };
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.blockedCount > 0) {
    return ' · Algunos PDFs no se abrieron; usa los enlaces en pantalla';
  }
  if (result.total === 1) return ' · Documento abierto en nueva pestaña';
  return ` · ${result.total} documentos abiertos en nuevas pestañas`;
}

/** Tras emisión: abre PDFs automáticamente (pestañas reservadas en el clic de pago). */
export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  if (countEmissionDocs(docs) === 0) {
    return { opened: [], total: 0, blockedCount: 0 };
  }
  return openEmissionPdfs(docs);
}
