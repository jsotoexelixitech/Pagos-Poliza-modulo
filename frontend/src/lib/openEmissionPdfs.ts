export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

const MAX_EMISSION_DOCS = 4;

/** Pestañas reservadas en el clic del usuario (SysIP payment-admin: window.open() sin URL). */
let reservedPopupWindows: Window[] = [];

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));
}

function writePopupLoading(w: Window): void {
  try {
    w.document.open();
    w.document.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>La Mundial</title></head>'
      + '<body style="font-family:Poppins,sans-serif;padding:2rem;color:#0F1A5A">'
      + '<p>Generando documentos…</p></body></html>',
    );
    w.document.close();
  } catch {
    // cross-origin después de navegar — ignorar
  }
}

/** Llamar de forma síncrona en el clic «Verificar pago» / «Confirmar OTP», antes de cualquier await. */
export function reserveEmissionPopupSlots(count = MAX_EMISSION_DOCS): void {
  releaseEmissionPopupSlots();
  const slots = Math.min(Math.max(count, 1), MAX_EMISSION_DOCS);
  for (let i = 0; i < slots; i += 1) {
    const w = window.open('about:blank', '_blank');
    if (w) {
      writePopupLoading(w);
      reservedPopupWindows.push(w);
    }
  }
}

export function releaseEmissionPopupSlots(): void {
  for (const w of reservedPopupWindows) {
    try {
      if (w && !w.closed) w.close();
    } catch {
      // ignore
    }
  }
  reservedPopupWindows = [];
}

function navigateReservedPopups(urls: string[]): string[] {
  const opened: string[] = [];
  urls.forEach((url, index) => {
    const w = reservedPopupWindows[index];
    if (w && !w.closed) {
      try {
        w.location.href = url;
        opened.push(url);
      } catch {
        const fallback = window.open(url, '_blank');
        if (fallback) opened.push(url);
      }
    } else {
      const fallback = window.open(url, '_blank');
      if (fallback) opened.push(url);
    }
  });
  for (let i = urls.length; i < reservedPopupWindows.length; i += 1) {
    try {
      if (!reservedPopupWindows[i].closed) reservedPopupWindows[i].close();
    } catch {
      // ignore
    }
  }
  reservedPopupWindows = [];
  return opened;
}

/** Fallback si no hubo reserva en el clic (p. ej. reemitir manual). */
export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  if (reservedPopupWindows.length > 0) {
    return navigateReservedPopups(urls);
  }
  const opened: string[] = [];
  for (const url of urls) {
    const w = window.open(url, '_blank');
    if (w) opened.push(url);
  }
  return opened;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}

/** SysIP pay-form: aviso de éxito y abrir documentos (pestañas reservadas o window.open). */
export function notifyEmissionSuccessAndOpenPdfs(
  cnpoliza: string,
  docs: EmissionPdfDocs,
): string[] {
  window.alert(`Se ha generado exitosamente su emisión bajo el número ${cnpoliza}.`);
  return openEmissionPdfs(docs);
}
