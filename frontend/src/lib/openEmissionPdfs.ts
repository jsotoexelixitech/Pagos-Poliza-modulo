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

/** Ventana auxiliar abierta en el clic de pago (conserva gesto del usuario para N pestañas). */
let docOpenerWindow: Window | null = null;

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

/**
 * Llamar de forma síncrona al confirmar pago (antes de cualquier await).
 * Abre UNA pestaña auxiliar (no about:blank) que luego dispara los PDFs.
 */
export function prepareEmissionDocOpener(): void {
  closeEmissionDocOpener();
  docOpenerWindow = window.open(docOpenerPageUrl(), 'exelixi_emission_docs');
}

export function closeEmissionDocOpener(): void {
  if (docOpenerWindow && !docOpenerWindow.closed) {
    try {
      docOpenerWindow.close();
    } catch {
      /* ignore */
    }
  }
  docOpenerWindow = null;
}

function openUrlViaForm(url: string, target = '_blank'): void {
  const form = document.createElement('form');
  form.method = 'GET';
  form.action = url;
  form.target = target;
  form.style.display = 'none';
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function openUrlsViaFormStaggered(urls: string[], delayMs = 350): OpenEmissionResult {
  urls.forEach((url, index) => {
    window.setTimeout(() => openUrlViaForm(url), index * delayMs);
  });
  return { opened: urls, total: urls.length, blockedCount: 0 };
}

function postUrlsToOpener(urls: string[]): boolean {
  if (!docOpenerWindow || docOpenerWindow.closed) return false;
  try {
    docOpenerWindow.postMessage(
      { type: 'OPEN_DOCS', urls },
      window.location.origin,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre todos los PDFs. Preferir ventana auxiliar (gesto del usuario); si no, form staggered.
 */
export function openEmissionPdfs(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  if (urls.length === 0) {
    return { opened: [], total: 0, blockedCount: 0 };
  }

  if (docOpenerWindow && !docOpenerWindow.closed) {
    let attempt = 0;
    const tryPost = (): void => {
      postUrlsToOpener(urls);
      attempt += 1;
      if (attempt < 20 && docOpenerWindow && !docOpenerWindow.closed) {
        window.setTimeout(tryPost, 250);
      } else {
        docOpenerWindow = null;
      }
    };
    tryPost();
    return { opened: urls, total: urls.length, blockedCount: 0 };
  }

  return openUrlsViaFormStaggered(urls);
}

/** Mismo clic del usuario: abre todos los formularios de inmediato (sin ventana auxiliar). */
export function openEmissionPdfsOnUserClick(docs: EmissionPdfDocs): OpenEmissionResult {
  const urls = collectEmissionUrls(docs);
  urls.forEach((url) => openUrlViaForm(url));
  return { opened: urls, total: urls.length, blockedCount: 0 };
}

export function emissionPdfHint(result: OpenEmissionResult): string {
  if (result.total === 0) return '';
  if (result.blockedCount > 0) {
    return ' · Algunos PDFs no se abrieron; usa los enlaces en pantalla';
  }
  if (result.total === 1) return ' · Documento abierto en nueva pestaña';
  return ` · ${result.total} documentos abiertos en nuevas pestañas`;
}

/** Tras emisión async: envía URLs a la ventana auxiliar o abre vía form. */
export function notifyEmissionSuccessAndOpenPdfs(
  _cnpoliza: string,
  docs: EmissionPdfDocs,
): OpenEmissionResult {
  if (countEmissionDocs(docs) === 0) {
    closeEmissionDocOpener();
    return { opened: [], total: 0, blockedCount: 0 };
  }
  return openEmissionPdfs(docs);
}
