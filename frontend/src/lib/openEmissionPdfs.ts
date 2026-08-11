export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));
}

/**
 * SysIP pay-form / general.component: window.open(url, '_blank') en cadena síncrona.
 * Llamar justo después del alert de éxito en applyEmissionResult.
 */
export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  for (const url of urls) {
    window.open(url, '_blank');
  }
  return urls;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}

/** Igual que SysIP pay-form tras emitir: aviso de éxito y abrir PDFs en cadena. */
export function notifyEmissionSuccessAndOpenPdfs(
  cnpoliza: string,
  docs: EmissionPdfDocs,
): string[] {
  window.alert(`Se ha generado exitosamente su emisión bajo el número ${cnpoliza}.`);
  return openEmissionPdfs(docs);
}
